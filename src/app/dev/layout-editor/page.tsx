"use client";

import EditorCanvas, { DragTarget } from "@/components/layout-editor/EditorCanvas";
import RegionInspector from "@/components/layout-editor/RegionInspector";
import { useLayoutEditorState } from "@/components/layout-editor/useLayoutEditorState";
import {
  defaultFillForKind,
  defaultMaskForKind,
  defaultPlacementForKind,
  defaultStyleForKind,
} from "@/layout/defaults";
import {
  addRegion,
  moveRegionOrder,
  patchRegion,
  patchRegionStyle,
  removeRegion,
  replaceRegion,
  setRegionMaskType,
  setRegionTextArea,
  setRegionTextBox,
  sortedRegions,
} from "@/layout/edit";
import { FontSet } from "@/layout/fontEngine";
import { loadBrowserFonts } from "@/layout/fontLoader.client";
import { layoutFromLegacyBubbles } from "@/layout/legacy";
import { RegionPlan } from "@/layout/plan";
import { PreviewIssue } from "@/layout/preview";
import { Box, PageLayout, pageLayoutSchema, RegionKind } from "@/layout/types";
import { TextBubble } from "@/types";
import React, { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Development harness for the layout editor. Loads an image and a layout (or
 * legacy bubbles) from URLs and drives the same canvas and inspector the
 * in-app editor uses, without a database or login.
 *
 *   /dev/layout-editor?image=http://localhost:4177/page.jpg&bubbles=http://localhost:4177/page.bubbles.json
 *   /dev/layout-editor?image=...&layout=http://localhost:4177/out.layout.json
 */
const readImageSize = (url: string) =>
  new Promise<{ width: number; height: number }>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Image could not be loaded"));
    img.src = url;
  });

export default function LayoutEditorHarness() {
  const editor = useLayoutEditorState();
  const { layout, layoutRef, selectedId, select, apply, applyLive, recordSnapshot, reset, undo, redo } = editor;
  const [fonts, setFonts] = useState<FontSet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [dragTarget, setDragTarget] = useState<DragTarget>("area");
  const [zoom, setZoom] = useState(0.6);
  const [plans, setPlans] = useState<RegionPlan[]>([]);
  const [issues, setIssues] = useState<PreviewIssue[]>([]);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<"edit" | "server">("edit");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const params = new URLSearchParams(window.location.search);
    const image = params.get("image");
    if (!image) {
      setError("image parametresi gerekli");
      return;
    }
    setImageUrl(image);
    (async () => {
      const [loadedFonts, size] = await Promise.all([loadBrowserFonts(), readImageSize(image)]);
      setFonts(loadedFonts);
      const layoutUrl = params.get("layout");
      const bubblesUrl = params.get("bubbles");
      if (layoutUrl) {
        const parsed = pageLayoutSchema.safeParse(await (await fetch(layoutUrl)).json());
        if (!parsed.success) throw new Error("Layout JSON geçersiz");
        reset(parsed.data);
      } else if (bubblesUrl) {
        const bubbles = (await (await fetch(bubblesUrl)).json()) as TextBubble[];
        reset(layoutFromLegacyBubbles(bubbles, size.width, size.height));
      } else {
        reset(layoutFromLegacyBubbles([], size.width, size.height));
      }
    })().catch((loadError) => setError(loadError instanceof Error ? loadError.message : String(loadError)));
  }, [reset]);

  const selectedRegion = useMemo(
    () => layout?.regions.find((region) => region.id === selectedId) || null,
    [layout, selectedId],
  );
  const selectedPlan = useMemo(() => plans.find((plan) => plan.region.id === selectedId), [plans, selectedId]);
  const onPreviewComputed = useCallback((nextPlans: RegionPlan[], nextIssues: PreviewIssue[]) => {
    setPlans(nextPlans);
    setIssues(nextIssues);
  }, []);

  const withLayout = (update: (current: PageLayout) => PageLayout) => {
    const current = layoutRef.current;
    if (current) apply(update(current));
  };
  const onBoxLive = useCallback(
    (regionId: string, box: Box, target: DragTarget) => {
      const current = layoutRef.current;
      if (!current) return;
      applyLive(target === "textBox" ? setRegionTextBox(current, regionId, box) : setRegionTextArea(current, regionId, box));
    },
    [applyLive, layoutRef],
  );
  const onGestureStart = useCallback(() => layoutRef.current as PageLayout, [layoutRef]);
  const onGestureEnd = useCallback((snapshot: PageLayout) => recordSnapshot(snapshot), [recordSnapshot]);

  const changeKind = (regionId: string, kind: RegionKind) =>
    withLayout((current) =>
      replaceRegion(current, regionId, (region) => ({
        ...region,
        kind,
        style: defaultStyleForKind(kind),
        placement: defaultPlacementForKind(kind),
        mask: region.maskSource === "manual" ? region.mask : defaultMaskForKind(kind),
        maskSource: region.maskSource === "manual" ? "manual" : "auto",
        fill: defaultFillForKind(kind),
        render: undefined,
      })),
    );

  const serverRender = async () => {
    const current = layoutRef.current;
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/dev/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl, layout: current }),
      });
      const data = (await response.json()) as { error?: string; layout?: PageLayout; url?: string };
      if (!response.ok || !data.layout || !data.url) throw new Error(data.error || "Render failed");
      apply(data.layout);
      setServerUrl(data.url);
      setMode("server");
    } catch (renderError) {
      setError(renderError instanceof Error ? renderError.message : String(renderError));
    } finally {
      setBusy(false);
    }
  };

  if (process.env.NODE_ENV === "production") return null;

  return (
    <div className="flex h-screen flex-col bg-background text-text-main">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border-muted px-4 text-[10px] font-black uppercase tracking-wider">
        <span className="text-primary">Layout editor harness</span>
        <span className="mx-2 h-4 w-px bg-border-muted" />
        <button type="button" onClick={undo} disabled={!editor.canUndo} className="rounded-lg border border-border-muted px-2 py-1 disabled:opacity-30">Geri al</button>
        <button type="button" onClick={redo} disabled={!editor.canRedo} className="rounded-lg border border-border-muted px-2 py-1 disabled:opacity-30">Yinele</button>
        <button
          type="button"
          onClick={() => {
            const current = layoutRef.current;
            if (!current) return;
            const w = current.width * 0.24;
            const h = current.height * 0.08;
            const result = addRegion(current, "speech", { x: (current.width - w) / 2, y: (current.height - h) / 2, w, h });
            apply(result.layout);
            select(result.region.id);
          }}
          className="rounded-lg border border-border-muted px-2 py-1"
        >
          Bölge ekle
        </button>
        <button type="button" onClick={serverRender} disabled={busy || !layout} className="rounded-lg border border-primary/50 bg-primary/10 px-2 py-1 text-primary disabled:opacity-30">
          {busy ? "Render…" : "Sunucu render"}
        </button>
        <button type="button" onClick={() => setMode("edit")} className={`rounded-lg px-2 py-1 ${mode === "edit" ? "bg-primary/15 text-primary" : ""}`}>Düzenle</button>
        <button type="button" onClick={() => setMode("server")} disabled={!serverUrl} className={`rounded-lg px-2 py-1 disabled:opacity-30 ${mode === "server" ? "bg-primary/15 text-primary" : ""}`}>Sunucu çıktısı</button>
        <span className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => setZoom((v) => Math.max(0.25, v - 0.1))} className="rounded-lg border border-border-muted px-2 py-1">-</button>
          <span className="w-12 text-center font-mono">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom((v) => Math.min(3, v + 0.1))} className="rounded-lg border border-border-muted px-2 py-1">+</button>
        </span>
        <button
          type="button"
          onClick={() => {
            const current = layoutRef.current;
            if (current) console.log(JSON.stringify(current, null, 2));
          }}
          className="rounded-lg border border-border-muted px-2 py-1"
        >
          JSON → console
        </button>
      </header>
      <div className="flex min-h-0 flex-1">
        <div className="custom-scrollbar min-w-0 flex-1 overflow-auto bg-black/60 p-4" data-testid="canvas-scroll">
          {error && <div className="mb-3 rounded-xl border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-300">{error}</div>}
          {!layout && !error && <p className="text-xs text-text-muted">Yükleniyor…</p>}
          {layout && fonts && mode === "edit" && (
            <EditorCanvas
              layout={layout}
              imageUrl={imageUrl}
              fonts={fonts}
              selectedId={selectedId}
              dragTarget={dragTarget}
              showSourceBoxes={false}
              zoom={zoom}
              onSelect={select}
              onBoxLive={onBoxLive}
              onGestureStart={onGestureStart}
              onGestureEnd={onGestureEnd}
              onPreviewComputed={onPreviewComputed}
            />
          )}
          {mode === "server" && serverUrl && <img src={serverUrl} alt="server render" style={{ width: `${zoom * 100}%` }} />}
          {issues.length > 0 && (
            <div className="mt-3 text-[10px] text-amber-300/90" data-testid="issues">
              {issues.map((issue, index) => (
                <span key={index} className="mr-3">{issue.regionId}: {issue.message}</span>
              ))}
            </div>
          )}
        </div>
        <aside className="custom-scrollbar w-[22rem] shrink-0 overflow-y-auto border-l border-border-muted bg-surface/60 p-3">
          {layout && selectedRegion ? (
            <RegionInspector
              region={selectedRegion}
              plan={selectedPlan}
              dragTarget={dragTarget}
              busy={busy}
              onPatch={(patch) => withLayout((current) => patchRegion(current, selectedRegion.id, patch))}
              onStylePatch={(patch) => withLayout((current) => patchRegionStyle(current, selectedRegion.id, patch))}
              onKindChange={(kind) => changeKind(selectedRegion.id, kind)}
              onMaskType={(type) => withLayout((current) => setRegionMaskType(current, selectedRegion.id, type, selectedPlan?.area || selectedRegion.textBox))}
              onResetArea={() => withLayout((current) => patchRegion(current, selectedRegion.id, { textArea: undefined }))}
              onDragTarget={setDragTarget}
              onTranslate={() => setError("Harness: çeviri ucu kimlik doğrulama gerektirir")}
              onMove={(direction) => withLayout((current) => moveRegionOrder(current, selectedRegion.id, direction))}
              onDelete={() => {
                withLayout((current) => removeRegion(current, selectedRegion.id));
                select(null);
              }}
            />
          ) : layout ? (
            <div className="space-y-2">
              {sortedRegions(layout).map((region) => (
                <button key={region.id} type="button" onClick={() => select(region.id)} className="block w-full rounded-xl border border-border-muted p-2 text-left text-xs">
                  <span className="mr-2 font-black text-primary">{region.order + 1}</span>
                  {region.translatedText || "—"}
                </button>
              ))}
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
