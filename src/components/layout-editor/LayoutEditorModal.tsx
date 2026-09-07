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
  Minus,
  PencilRuler,
  Plus,
  Redo2,
  Save,
  Undo2,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Chip,
  FullscreenShell,
  IconButton,
  Kbd,
  Mono,
  SectionLabel,
  SegmentedControl,
  Spinner,
} from "@/components/ui";
import EditorCanvas, { DragTarget } from "./EditorCanvas";
import RegionInspector from "./RegionInspector";
import { useLayoutEditorState } from "./useLayoutEditorState";

type Busy = null | "loading" | "saving" | "preview" | "apply" | "translate";

const ORIGIN_LABEL: Record<string, string> = {
  stored: "Saved layout",
  legacy: "Built from legacy boxes (not saved yet)",
  empty: "Empty page: add a region or run translation",
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
      title: "Unsaved changes",
      message: "Your layout changes are not saved. Close anyway?",
      type: "warning",
      onConfirm: closeLayoutEditor,
    });
  }, [closeLayoutEditor, confirm, isDirty]);

  // The shell re-runs its dialog effect (focus, scroll lock) whenever onClose
  // changes, so give it a stable callback that always calls the latest one.
  // While a confirm dialog is open, Escape belongs to that dialog.
  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;
  const shellClose = useCallback(() => {
    if (useUIStore.getState().confirmConfig.isOpen) return;
    requestCloseRef.current();
  }, []);

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
      showToast("Layout saved.", "success", 3000);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setBusy(null);
    }
  };

  const applyRender = () => {
    confirm({
      title: "Re-render page",
      message: "The page will be rendered on the server with this layout and replace the current translation. The previous render is kept.",
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
          showToast("Page re-rendered and saved.", "success", 4000);
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
        `Translation finished (${result.usage.totalTokenCount} tokens, $${result.cost.toFixed(5)}).`,
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

  // Capture phase so Escape can blur an input or clear the selection before
  // the shell's own Escape listener (which closes the editor) sees it. When a
  // confirm dialog is open, Escape is left to that dialog.
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
        if (useUIStore.getState().confirmConfig.isOpen) return;
        if (typing) {
          event.stopPropagation();
          (target as HTMLElement).blur();
        } else if (selectedId) {
          event.stopPropagation();
          select(null);
        }
        // Otherwise the shell handles Escape and calls requestClose.
      } else if ((event.key === "Delete" || event.key === "Backspace") && !typing && selectedId) {
        event.preventDefault();
        deleteSelected();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageId, selectedId, undo, redo]);

  if (!image) return null;

  const missingTranslations = layout
    ? layout.regions.filter((region) => !region.locked && !region.translatedText.trim() && region.sourceText.trim()).length
    : 0;
  const isBusy = busy !== null;
  const originalUrl = resolveImageUrl(image.originalUrl);
  const subtitle = `${ORIGIN_LABEL[origin] || ""}${isDirty ? " · unsaved changes" : ""}`;

  return (
    <FullscreenShell
      open
      onClose={shellClose}
      icon={<PencilRuler />}
      title={image.fileName}
      subtitle={subtitle}
      actions={
        <>
          <IconButton label="Undo (Ctrl+Z)" variant="secondary" onClick={undo} disabled={!editor.canUndo}>
            <Undo2 />
          </IconButton>
          <IconButton label="Redo (Ctrl+Shift+Z)" variant="secondary" onClick={redo} disabled={!editor.canRedo}>
            <Redo2 />
          </IconButton>
          <span aria-hidden="true" className="mx-1 h-6 w-px bg-line" />
          <Button variant="secondary" icon={<Plus />} onClick={addNewRegion} disabled={!layout || isBusy}>
            Add region
          </Button>
          <Button
            variant="secondary"
            icon={<Languages />}
            onClick={() => translate()}
            disabled={!layout || isBusy || missingTranslations === 0}
          >
            Translate missing{missingTranslations ? ` (${missingTranslations})` : ""}
          </Button>
          <Button variant="secondary" icon={<Eye />} onClick={runServerPreview} disabled={!layout || isBusy} loading={busy === "preview"}>
            Server preview
          </Button>
          <Button variant="secondary" icon={<Save />} onClick={saveOnly} disabled={!layout || isBusy || !isDirty} loading={busy === "saving"}>
            Save
          </Button>
          <Button variant="primary" icon={<Check />} onClick={applyRender} disabled={!layout || isBusy} loading={busy === "apply"}>
            Apply
          </Button>
        </>
      }
    >
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line bg-page px-3">
          <SegmentedControl
            size="sm"
            label="View"
            value={mode}
            onChange={setMode}
            options={[
              { value: "edit", label: "Edit" },
              { value: "preview", label: "Server output", disabled: !previewUrl },
            ]}
          />
          <Chip
            tone={showSourceBoxes ? "danger" : "neutral"}
            active={showSourceBoxes}
            onClick={() => setShowSourceBoxes((value) => !value)}
          >
            Source boxes
          </Chip>
          <span className="ml-auto flex items-center gap-1">
            <IconButton label="Zoom out" size="sm" onClick={() => setZoom((value) => Math.max(0.25, value - 0.25))}>
              <Minus />
            </IconButton>
            <Mono className="w-12 text-center text-xs text-ink-2">{Math.round(zoom * 100)}%</Mono>
            <IconButton label="Zoom in" size="sm" onClick={() => setZoom((value) => Math.min(4, value + 0.25))}>
              <Plus />
            </IconButton>
            <Button variant="ghost" size="sm" onClick={() => setZoom(1)}>
              Fit
            </Button>
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-theater p-6">
          {busy === "loading" && (
            <div className="flex h-full items-center justify-center gap-3 text-sm text-theater-ink-2">
              <Spinner label="Loading layout and fonts" /> Loading layout and fonts…
            </div>
          )}
          {error && (
            <div role="alert" className="mb-4 rounded-control border border-shu/40 bg-shu-soft px-3 py-2 text-sm text-shu">
              {error}
            </div>
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
            <img src={previewUrl} alt="Server preview" className="block" style={{ width: `${zoom * 100}%` }} />
          )}
        </div>

        {issues.length > 0 && mode === "edit" && (
          <div className="flex max-h-24 shrink-0 flex-wrap items-center gap-1 overflow-y-auto border-t border-line bg-page px-3 py-1.5 text-xs text-warn">
            {issues.map((issue, index) => {
              const region = layout?.regions.find((item) => item.id === issue.regionId);
              return (
                <Button key={`${issue.regionId}-${index}`} variant="ghost" size="sm" onClick={() => select(issue.regionId)}>
                  <span className="text-warn">
                    <Mono>{region ? `${region.order + 1}` : issue.regionId}</Mono>: {issue.message}
                  </span>
                </Button>
              );
            })}
          </div>
        )}
      </div>

      <aside className="w-80 shrink-0 overflow-y-auto border-l border-line bg-page p-3">
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
          <div className="flex flex-col gap-2">
            <SectionLabel>Regions</SectionLabel>
            {sortedRegions(layout).map((region) => (
              <button
                key={region.id}
                type="button"
                onClick={() => select(region.id)}
                className="flex w-full items-start gap-2 rounded-control border border-line px-2.5 py-2 text-left transition-colors duration-120 hover:border-ink-3"
              >
                <Mono className="mt-0.5 w-5 shrink-0 text-xs text-action">{region.order + 1}</Mono>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink">{region.translatedText || "—"}</span>
                  <span className="block truncate text-xs text-ink-3">{region.sourceText}</span>
                </span>
              </button>
            ))}
            {layout.regions.length === 0 && (
              <p className="text-xs text-ink-3">No regions on this page. Start with Add region.</p>
            )}
            <p className="pt-2 text-xs leading-relaxed text-ink-3">
              Click a box to select it. Drag to move, use the handles to resize.{" "}
              <Kbd>Ctrl</Kbd>+<Kbd>Z</Kbd> undoes, <Kbd>Delete</Kbd> removes.
            </p>
          </div>
        ) : null}
      </aside>
    </FullscreenShell>
  );
};

export default LayoutEditorModal;
