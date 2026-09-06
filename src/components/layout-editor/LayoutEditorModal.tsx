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
import { RegionPlan } from "@/layout/plan";
import { PreviewIssue } from "@/layout/preview";
import { Box, PageLayout, RegionKind } from "@/layout/types";
import { useConfirm } from "@/hooks/useConfirm";
import { seriesKeys } from "@/hooks/useSeriesQueries";
import {
  fetchPageLayout,
  renderPageLayout,
  savePageLayout,
  translateLayoutText,
} from "@/services/layoutEditor.service";
import { useSeriesStore } from "@/stores/useSeriesStore";
import { useUIStore } from "@/stores/useUIStore";
import { resolveImageUrl } from "@/utils/url";
import { useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Eye,
  Languages,
  Loader2,
  Minus,
  PencilRuler,
  Plus,
  Redo2,
  Save,
  Undo2,
  X,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import EditorCanvas, { DragTarget } from "./EditorCanvas";
import RegionInspector from "./RegionInspector";
import { useLayoutEditorState } from "./useLayoutEditorState";

type Busy = null | "loading" | "saving" | "preview" | "apply" | "translate";

const ORIGIN_LABEL: Record<string, string> = {
  stored: "Kayıtlı layout",
  legacy: "Eski kutulardan üretildi (henüz kaydedilmedi)",
  empty: "Boş sayfa: bölge ekleyin veya çeviri çalıştırın",
};

/**
 * Full-screen page editor. The browser shows a live preview built from the
 * same layout code the server renders with; the server is only asked for a
 * preview when masks need to be resolved against the pixels, and for the
 * final apply.
 */
const LayoutEditorModal: React.FC = () => {
  const image = useUIStore((state) => state.layoutEditorImage);
  const closeLayoutEditor = useUIStore((state) => state.closeLayoutEditor);
  const showToast = useUIStore((state) => state.showToast);
  const activeSeriesId = useSeriesStore((state) => state.activeSeriesId);
  const queryClient = useQueryClient();
  const { confirm } = useConfirm();
  const editor = useLayoutEditorState();
  const { layout, selectedId, select, apply, applyLive, recordSnapshot, reset, markSaved, isDirty, undo, redo, layoutRef } = editor;

  const [fonts, setFonts] = useState<FontSet | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState<string>("");
  const [dragTarget, setDragTarget] = useState<DragTarget>("area");
  const [showSourceBoxes, setShowSourceBoxes] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [plans, setPlans] = useState<RegionPlan[]>([]);
  const [issues, setIssues] = useState<PreviewIssue[]>([]);

  const imageId = image?.id;

  useEffect(() => {
    if (!imageId) return;
    let cancelled = false;
    setBusy("loading");
    setError(null);
    setPreviewUrl(null);
    setMode("edit");
    reset(null);
    Promise.all([fetchPageLayout(imageId), loadBrowserFonts()])
      .then(([data, loadedFonts]) => {
        if (cancelled) return;
        setFonts(loadedFonts);
        setOrigin(data.origin);
        reset(data.layout);
      })
      .catch((loadError) => {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      })
      .finally(() => {
        if (!cancelled) setBusy(null);
      });
    return () => {
      cancelled = true;
    };
  }, [imageId, reset]);

  const refreshImages = useCallback(() => {
    if (activeSeriesId) {
      queryClient.invalidateQueries({ queryKey: seriesKeys.images(activeSeriesId) });
      queryClient.invalidateQueries({ queryKey: seriesKeys.lists() });
    }
  }, [activeSeriesId, queryClient]);

  const requestClose = useCallback(() => {
    if (!isDirty) {
      closeLayoutEditor();
      return;
    }
    confirm({
      title: "Kaydedilmemiş değişiklikler",
      message: "Layout değişiklikleri kaydedilmedi. Kapatmak istiyor musun?",
      type: "warning",
      onConfirm: closeLayoutEditor,
    });
  }, [closeLayoutEditor, confirm, isDirty]);

  const selectedRegion = useMemo(
    () => layout?.regions.find((region) => region.id === selectedId) || null,
    [layout, selectedId],
  );
  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.region.id === selectedId),
    [plans, selectedId],
  );

  const onPreviewComputed = useCallback((nextPlans: RegionPlan[], nextIssues: PreviewIssue[]) => {
    setPlans(nextPlans);
    setIssues(nextIssues);
  }, []);

  // ---- mutations -----------------------------------------------------------

  const withLayout = (update: (current: PageLayout) => PageLayout) => {
    const current = layoutRef.current;
    if (current) apply(update(current));
  };

  const onBoxLive = useCallback(
    (regionId: string, box: Box, target: DragTarget) => {
      const current = layoutRef.current;
      if (!current) return;
      applyLive(
        target === "textBox"
          ? setRegionTextBox(current, regionId, box)
          : setRegionTextArea(current, regionId, box),
      );
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

  const addNewRegion = () => {
    const current = layoutRef.current;
    if (!current) return;
    const w = current.width * 0.24;
    const h = current.height * 0.08;
    const box = { x: (current.width - w) / 2, y: (current.height - h) / 2, w, h };
    const result = addRegion(current, "speech", box);
    apply(result.layout);
    select(result.region.id);
    setMode("edit");
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    withLayout((current) => removeRegion(current, selectedId));
    select(null);
  };

  // ---- server actions ------------------------------------------------------

  const runServerPreview = async () => {
    const current = layoutRef.current;
    if (!imageId || !current) return;
    setBusy("preview");
    setError(null);
    try {
      const result = await renderPageLayout(imageId, current, false);
      apply(result.layout);
      setPreviewUrl(result.url);
      setMode("preview");
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : String(previewError));
    } finally {
      setBusy(null);
    }
  };

  const saveOnly = async () => {
    const current = layoutRef.current;
    if (!imageId || !current) return;
    setBusy("saving");
    setError(null);
    try {
      const result = await savePageLayout(imageId, current);
      markSaved(result.layout);
      showToast("Layout kaydedildi.", "success", 3000);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setBusy(null);
    }
  };

  const applyRender = () => {
    confirm({
      title: "Sayfayı yeniden üret",
      message: "Bu layout ile sayfa sunucuda yeniden render edilip mevcut çevirinin yerine geçecek. Eski render saklanır.",
      type: "warning",
      onConfirm: async () => {
        const current = layoutRef.current;
        if (!imageId || !current) return;
        setBusy("apply");
        setError(null);
        try {
          const result = await renderPageLayout(imageId, current, true);
          markSaved(result.layout);
          setPreviewUrl(result.url);
          setMode("preview");
          refreshImages();
          showToast("Sayfa yeniden üretildi ve kaydedildi.", "success", 4000);
        } catch (applyError) {
          setError(applyError instanceof Error ? applyError.message : String(applyError));
        } finally {
          setBusy(null);
        }
      },
    });
  };

  const translate = async (regionIds?: string[]) => {
    const current = layoutRef.current;
    if (!imageId || !current) return;
    setBusy("translate");
    setError(null);
    try {
      const result = await translateLayoutText(imageId, current, regionIds);
      apply(result.layout);
      showToast(
        `Çeviri tamamlandı (${result.usage.totalTokenCount} token, $${result.cost.toFixed(5)}).`,
        "success",
        4000,
      );
      refreshImages();
    } catch (translateError) {
      setError(translateError instanceof Error ? translateError.message : String(translateError));
    } finally {
      setBusy(null);
    }
  };

  // ---- keyboard ------------------------------------------------------------

  useEffect(() => {
    if (!imageId) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = !!target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        if (typing) return;
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveOnly();
      } else if (event.key === "Escape") {
        if (typing) (target as HTMLElement).blur();
        else if (selectedId) select(null);
        else requestClose();
      } else if ((event.key === "Delete" || event.key === "Backspace") && !typing && selectedId) {
        event.preventDefault();
        deleteSelected();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageId, selectedId, undo, redo, requestClose]);

  if (!image) return null;

  const missingTranslations = layout
    ? layout.regions.filter((region) => !region.locked && !region.translatedText.trim() && region.sourceText.trim()).length
    : 0;
  const isBusy = busy !== null;
  const originalUrl = resolveImageUrl(image.originalUrl);

  return (
    <div className="fixed inset-0 z-[150] flex flex-col bg-background text-text-main">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border-muted bg-surface/80 px-4 backdrop-blur-md">
        <PencilRuler className="h-4 w-4 text-primary" />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{image.fileName}</p>
          <p className="truncate text-[9px] font-bold uppercase tracking-widest text-text-dark">
            {ORIGIN_LABEL[origin] || ""}
            {isDirty ? " · kaydedilmemiş değişiklik" : ""}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <button type="button" title="Geri al (Ctrl+Z)" onClick={undo} disabled={!editor.canUndo} className="rounded-lg border border-border-muted p-2 text-text-dark hover:text-primary disabled:opacity-30">
            <Undo2 className="h-4 w-4" />
          </button>
          <button type="button" title="Yinele (Ctrl+Shift+Z)" onClick={redo} disabled={!editor.canRedo} className="rounded-lg border border-border-muted p-2 text-text-dark hover:text-primary disabled:opacity-30">
            <Redo2 className="h-4 w-4" />
          </button>
          <span className="mx-1 h-6 w-px bg-border-muted" />
          <button type="button" onClick={addNewRegion} disabled={!layout || isBusy} className="flex items-center gap-1.5 rounded-xl border border-border-muted px-3 py-2 text-[10px] font-black uppercase tracking-wider text-text-main hover:border-primary/60 disabled:opacity-40">
            <Plus className="h-3.5 w-3.5" /> Bölge ekle
          </button>
          <button type="button" onClick={() => translate()} disabled={!layout || isBusy || missingTranslations === 0} className="flex items-center gap-1.5 rounded-xl border border-border-muted px-3 py-2 text-[10px] font-black uppercase tracking-wider text-text-main hover:border-primary/60 disabled:opacity-40">
            <Languages className="h-3.5 w-3.5" /> Eksikleri çevir{missingTranslations ? ` (${missingTranslations})` : ""}
          </button>
          <button type="button" onClick={runServerPreview} disabled={!layout || isBusy} className="flex items-center gap-1.5 rounded-xl border border-border-muted px-3 py-2 text-[10px] font-black uppercase tracking-wider text-text-main hover:border-primary/60 disabled:opacity-40">
            {busy === "preview" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />} Sunucu önizleme
          </button>
          <button type="button" onClick={saveOnly} disabled={!layout || isBusy || !isDirty} className="flex items-center gap-1.5 rounded-xl border border-border-muted px-3 py-2 text-[10px] font-black uppercase tracking-wider text-text-main hover:border-primary/60 disabled:opacity-40">
            {busy === "saving" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Kaydet
          </button>
          <button type="button" onClick={applyRender} disabled={!layout || isBusy} className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white shadow-glow hover:bg-primary-hover disabled:opacity-40">
            {busy === "apply" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Uygula
          </button>
          <button type="button" onClick={requestClose} className="ml-1 rounded-lg p-2 text-text-dark hover:text-text-main" title="Kapat (Esc)">
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="relative flex min-w-0 flex-1 flex-col">
          <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border-muted bg-surface/60 px-4 text-[10px] font-black uppercase tracking-wider text-text-dark">
            <button type="button" onClick={() => setMode("edit")} className={`rounded-lg px-2.5 py-1 ${mode === "edit" ? "bg-primary/15 text-primary" : "hover:text-text-main"}`}>Düzenle</button>
            <button type="button" onClick={() => setMode("preview")} disabled={!previewUrl} className={`rounded-lg px-2.5 py-1 disabled:opacity-30 ${mode === "preview" ? "bg-primary/15 text-primary" : "hover:text-text-main"}`}>Sunucu çıktısı</button>
            <span className="mx-1 h-4 w-px bg-border-muted" />
            <button type="button" onClick={() => setShowSourceBoxes((value) => !value)} className={`rounded-lg px-2.5 py-1 ${showSourceBoxes ? "bg-red-500/15 text-red-400" : "hover:text-text-main"}`}>Kaynak kutuları</button>
            <span className="ml-auto flex items-center gap-1">
              <button type="button" onClick={() => setZoom((value) => Math.max(0.25, value - 0.25))} className="rounded-lg border border-border-muted p-1 hover:text-text-main"><Minus className="h-3 w-3" /></button>
              <span className="w-12 text-center font-mono">{Math.round(zoom * 100)}%</span>
              <button type="button" onClick={() => setZoom((value) => Math.min(4, value + 0.25))} className="rounded-lg border border-border-muted p-1 hover:text-text-main"><Plus className="h-3 w-3" /></button>
            </span>
          </div>

          <div className="custom-scrollbar min-h-0 flex-1 overflow-auto bg-black/60 p-6">
            {busy === "loading" && (
              <div className="flex h-full items-center justify-center gap-3 text-sm text-text-muted">
                <Loader2 className="h-5 w-5 animate-spin text-primary" /> Layout ve fontlar yükleniyor…
              </div>
            )}
            {error && (
              <div className="mb-4 rounded-2xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">{error}</div>
            )}
            {layout && fonts && mode === "edit" && (
              <EditorCanvas
                layout={layout}
                imageUrl={originalUrl}
                fonts={fonts}
                selectedId={selectedId}
                dragTarget={dragTarget}
                showSourceBoxes={showSourceBoxes}
                zoom={zoom}
                onSelect={select}
                onBoxLive={onBoxLive}
                onGestureStart={onGestureStart}
                onGestureEnd={onGestureEnd}
                onPreviewComputed={onPreviewComputed}
              />
            )}
            {mode === "preview" && previewUrl && (
              <img src={previewUrl} alt="Sunucu önizlemesi" className="block" style={{ width: `${zoom * 100}%` }} />
            )}
          </div>

          {issues.length > 0 && mode === "edit" && (
            <div className="max-h-24 shrink-0 overflow-y-auto border-t border-border-muted bg-surface/70 px-4 py-2 text-[10px] text-amber-300/90">
              {issues.map((issue, index) => {
                const region = layout?.regions.find((item) => item.id === issue.regionId);
                return (
                  <button key={`${issue.regionId}-${index}`} type="button" onClick={() => select(issue.regionId)} className="mr-3 hover:underline">
                    {region ? `${region.order + 1}` : issue.regionId}: {issue.message}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <aside className="custom-scrollbar w-[22rem] shrink-0 overflow-y-auto border-l border-border-muted bg-surface/60 p-3">
          {layout && selectedRegion ? (
            <RegionInspector
              region={selectedRegion}
              plan={selectedPlan}
              dragTarget={dragTarget}
              busy={isBusy}
              onPatch={(patch) => withLayout((current) => patchRegion(current, selectedRegion.id, patch))}
              onStylePatch={(patch) => withLayout((current) => patchRegionStyle(current, selectedRegion.id, patch))}
              onKindChange={(kind) => changeKind(selectedRegion.id, kind)}
              onMaskType={(type) =>
                withLayout((current) =>
                  setRegionMaskType(current, selectedRegion.id, type, selectedPlan?.area || selectedRegion.textBox),
                )
              }
              onResetArea={() => withLayout((current) => patchRegion(current, selectedRegion.id, { textArea: undefined }))}
              onDragTarget={setDragTarget}
              onTranslate={() => translate([selectedRegion.id])}
              onMove={(direction) => withLayout((current) => moveRegionOrder(current, selectedRegion.id, direction))}
              onDelete={deleteSelected}
            />
          ) : layout ? (
            <div className="space-y-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-text-dark">Bölgeler</p>
              {sortedRegions(layout).map((region) => (
                <button
                  key={region.id}
                  type="button"
                  onClick={() => select(region.id)}
                  className="flex w-full items-start gap-2 rounded-xl border border-border-muted bg-surface-raised/40 p-2.5 text-left hover:border-primary/60"
                >
                  <span className="mt-0.5 w-5 shrink-0 text-[10px] font-black text-primary">{region.order + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-text-main">{region.translatedText || "—"}</span>
                    <span className="block truncate text-[10px] text-text-dark">{region.sourceText}</span>
                  </span>
                </button>
              ))}
              {layout.regions.length === 0 && (
                <p className="text-xs text-text-muted">Bu sayfada bölge yok. Üstteki &quot;Bölge ekle&quot; ile başlayın.</p>
              )}
              <p className="pt-2 text-[10px] leading-relaxed text-text-dark">
                Bir bölgeyi seçmek için kanvasta kutusuna tıklayın. Sürükleyerek taşıyın, köşelerden boyutlandırın. Ctrl+Z geri alır, Delete siler.
              </p>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
};

export default LayoutEditorModal;
