"use client";

import EditorCanvas, { DragTarget } from "@/components/layout-editor/EditorCanvas";
import RegionInspector from "@/components/layout-editor/RegionInspector";
import { useLayoutEditorState } from "@/components/layout-editor/useLayoutEditorState";
import { Button, IconButton, Mono, SegmentedControl } from "@/components/ui";
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
import { Minus, Plus, Redo2, Undo2 } from "lucide-react";
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
      setError("The image parameter is required");
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
        if (!parsed.success) throw new Error("Layout JSON is invalid");
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
    <div className="flex h-screen flex-col bg-paper text-ink">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-page px-3">
        <span className="text-sm font-medium text-action">Layout editor harness</span>
        <span aria-hidden="true" className="mx-1 h-6 w-px bg-line" />
        <IconButton label="Undo (Ctrl+Z)" variant="secondary" onClick={undo} disabled={!editor.canUndo}>
          <Undo2 />
        </IconButton>
        <IconButton label="Redo (Ctrl+Shift+Z)" variant="secondary" onClick={redo} disabled={!editor.canRedo}>
          <Redo2 />
        </IconButton>
        <Button
          variant="secondary"
          icon={<Plus />}
          onClick={() => {
            const current = layoutRef.current;
            if (!current) return;
            const w = current.width * 0.24;
            const h = current.height * 0.08;
            const result = addRegion(current, "speech", { x: (current.width - w) / 2, y: (current.height - h) / 2, w, h });
            apply(result.layout);
            select(result.region.id);
          }}
        >
          Add region
        </Button>
        <Button variant="primary" onClick={serverRender} disabled={busy || !layout} loading={busy}>
          Server render
        </Button>
        <SegmentedControl
          size="sm"
          label="View"
          value={mode}
          onChange={setMode}
          options={[
            { value: "edit", label: "Edit" },
            { value: "server", label: "Server output", disabled: !serverUrl },
          ]}
        />
        <span className="ml-auto flex items-center gap-1">
          <IconButton label="Zoom out" size="sm" onClick={() => setZoom((v) => Math.max(0.25, v - 0.1))}>
            <Minus />
          </IconButton>
          <Mono className="w-12 text-center text-xs text-ink-2">{Math.round(zoom * 100)}%</Mono>
          <IconButton label="Zoom in" size="sm" onClick={() => setZoom((v) => Math.min(3, v + 0.1))}>
            <Plus />
          </IconButton>
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            const current = layoutRef.current;
            if (current) console.log(JSON.stringify(current, null, 2));
          }}
        >
          Log JSON to console
        </Button>
      </header>
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-auto bg-theater p-4" data-testid="canvas-scroll">
          {error && (
            <div role="alert" className="mb-3 rounded-control border border-shu/40 bg-shu-soft px-3 py-2 text-sm text-shu">
              {error}
            </div>
          )}
          {!layout && !error && <p className="text-xs text-white/70">Loading…</p>}
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
          {mode === "server" && serverUrl && <img src={serverUrl} alt="Server render" style={{ width: `${zoom * 100}%` }} />}
          {issues.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-warn" data-testid="issues">
              {issues.map((issue, index) => (
                <span key={index}><Mono>{issue.regionId}</Mono>: {issue.message}</span>
              ))}
            </div>
          )}
        </div>
        <aside className="w-80 shrink-0 overflow-y-auto border-l border-line bg-page p-3">
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
              onTranslate={() => setError("Harness: the translate endpoint requires authentication")}
              onMove={(direction) => withLayout((current) => moveRegionOrder(current, selectedRegion.id, direction))}
              onDelete={() => {
                withLayout((current) => removeRegion(current, selectedRegion.id));
                select(null);
              }}
            />
          ) : layout ? (
            <div className="flex flex-col gap-2">
              {sortedRegions(layout).map((region) => (
                <button
                  key={region.id}
                  type="button"
                  onClick={() => select(region.id)}
                  className="flex w-full items-start gap-2 rounded-control border border-line px-2.5 py-2 text-left transition-colors duration-120 hover:border-ink-3"
                >
                  <Mono className="mt-0.5 w-5 shrink-0 text-xs text-action">{region.order + 1}</Mono>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{region.translatedText || "—"}</span>
                </button>
              ))}
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
