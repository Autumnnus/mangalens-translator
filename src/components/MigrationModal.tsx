import {
  Button,
  EmptyState,
  FullscreenShell,
  IconButton,
  Mono,
  SegmentedControl,
  Spinner,
  StageBar,
} from "@/components/ui";
import { useConfirm } from "@/hooks/useConfirm";
import { isActiveJob, usePageJobs } from "@/hooks/usePageJobs";
import { seriesKeys, useSeriesImagesQuery } from "@/hooks/useSeriesQueries";
import {
  dropSeriesLegacy,
  pageMigrationAction,
  startMigration,
} from "@/services/migration.service";
import { useUIStore } from "@/stores/useUIStore";
import { PageJobSummary, ProcessedImage, ViewMode } from "@/types";
import { describePageStatus, PageTone } from "@/utils/stages";
import { resolveImageUrl } from "@/utils/url";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  ImageOff,
  PencilLine,
  Sparkles,
  Trash2,
  Undo2,
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import ComparisonView from "./ComparisonView";

type Busy = null | "start" | "redetect" | "cleanup" | "page";
type PageAction = "preview" | "apply" | "revert" | "drop-legacy";

const toneClass: Record<PageTone, string> = {
  neutral: "text-ink-3",
  accent: "text-action",
  ok: "text-ok",
  warn: "text-warn",
  danger: "text-shu",
};

const pages = (count: number) => `${count} ${count === 1 ? "page" : "pages"}`;

const isMigratedPage = (image: ProcessedImage) =>
  image.layoutVersion === 2 && !!image.legacyTranslatedUrl;

/** Stage bar + label for a row in the migration list. */
const describeMigrationRow = (image: ProcessedImage, job?: PageJobSummary | null) => {
  const status = describePageStatus(image, job);
  if (status.active) return status;
  if (isMigratedPage(image)) {
    return { ...status, label: "Migrated · review", tone: "ok" as PageTone };
  }
  if (image.hasLegacyBubbles) {
    return { ...status, label: "Legacy · free migration", tone: "warn" as PageTone };
  }
  return { ...status, label: "Legacy · needs re-detection", tone: "danger" as PageTone };
};

const MODE_OPTIONS: Array<{ value: ViewMode; label: string }> = [
  { value: "slider", label: "Slider" },
  { value: "side-by-side", label: "Split" },
  { value: "toggle", label: "Toggle" },
];

/**
 * Migration panel for a series: moves flattened v1 pages to layout v2 (free,
 * from stored bubbles, or with Gemini re-detection), then lets the user
 * compare old and new renders page by page, revert, or drop the old files.
 */
const MigrationModal: React.FC = () => {
  const seriesId = useUIStore((state) => state.migrationSeriesId);
  const closeMigration = useUIStore((state) => state.closeMigration);
  const openLayoutEditor = useUIStore((state) => state.openLayoutEditor);
  const showToast = useUIStore((state) => state.showToast);
  const { confirm } = useConfirm();
  const queryClient = useQueryClient();
  const { data: imagesData } = useSeriesImagesQuery(seriesId);
  const { byImage, activeJobs } = usePageJobs(seriesId);
  const images = useMemo(() => imagesData || [], [imagesData]);

  const [busy, setBusy] = useState<Busy>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>("slider");
  const [pendingAction, setPendingAction] = useState<PageAction | null>(null);

  const legacyPages = useMemo(
    () => images.filter((image) => image.layoutVersion === 1 && !!image.translatedUrl),
    [images],
  );
  const migratedPages = useMemo(() => images.filter(isMigratedPage), [images]);
  const freeCount = legacyPages.filter((image) => image.hasLegacyBubbles).length;
  const needsRedetect = legacyPages.length - freeCount;
  const migrationJobs = activeJobs.filter((job) => job.provider === "migration" || job.provider === "gemini");

  const reviewList = useMemo(
    () => [...migratedPages, ...legacyPages].sort((a, b) => a.sequenceNumber - b.sequenceNumber),
    [migratedPages, legacyPages],
  );
  const selected = reviewList.find((image) => image.id === selectedId) || null;
  const selectedIndex = selected ? reviewList.indexOf(selected) : -1;

  useEffect(() => {
    if (!selectedId && reviewList.length > 0) setSelectedId(reviewList[0].id);
    if (selectedId && !reviewList.some((image) => image.id === selectedId)) {
      setSelectedId(reviewList[0]?.id || null);
    }
  }, [reviewList, selectedId]);

  useEffect(() => {
    setPreviewUrl(null);
  }, [selectedId]);

  const refresh = () => {
    if (!seriesId) return;
    queryClient.invalidateQueries({ queryKey: seriesKeys.images(seriesId) });
    queryClient.invalidateQueries({ queryKey: seriesKeys.lists() });
  };

  if (!seriesId) return null;

  const runStart = async (strategy: "legacy" | "redetect", imageIds?: string[]) => {
    setBusy(strategy === "legacy" ? "start" : "redetect");
    try {
      const result = await startMigration(seriesId, strategy, imageIds);
      showToast(
        `${pages(result.queued)} queued${
          result.skipped ? `, ${result.skipped} skipped because they have no bubble data` : ""
        }.`,
        "success",
        5000,
      );
      queryClient.invalidateQueries({ queryKey: ["page-jobs", seriesId] });
      refresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), "error", 6000);
    } finally {
      setBusy(null);
    }
  };

  const startAll = () => {
    if (freeCount === 0) return;
    confirm({
      title: "Migrate legacy pages",
      message: `${pages(freeCount)} will be re-typeset from the stored bubble data. No Gemini call is made, so this is free. The old renders are kept for review.`,
      type: "warning",
      onConfirm: () => void runStart("legacy"),
    });
  };

  const startRedetect = (imageIds?: string[]) => {
    const count = imageIds ? imageIds.length : legacyPages.length;
    if (count === 0) return;
    confirm({
      title: "Re-detect with Gemini",
      message: `${pages(count)} will be detected and translated again with Gemini Vision. This uses tokens and costs money. The old renders are kept for review.`,
      type: "warning",
      onConfirm: () => void runStart("redetect", imageIds),
    });
  };

  const cleanup = () => {
    if (migratedPages.length === 0) return;
    confirm({
      title: "Delete old renders",
      message: `The old render files of ${pages(migratedPages.length)} will be deleted permanently. Those pages can no longer be reverted.`,
      type: "danger",
      onConfirm: async () => {
        setBusy("cleanup");
        try {
          const result = await dropSeriesLegacy(seriesId);
          showToast(`${result.deleted} old ${result.deleted === 1 ? "render" : "renders"} deleted.`, "success", 4000);
          refresh();
        } catch (error) {
          showToast(error instanceof Error ? error.message : String(error), "error", 6000);
        } finally {
          setBusy(null);
        }
      },
    });
  };

  const pageAction = async (image: ProcessedImage, action: PageAction) => {
    setBusy("page");
    setPendingAction(action);
    try {
      const result = await pageMigrationAction(image.id, action);
      if (action === "preview" && result.url) {
        setPreviewUrl(result.url);
      } else {
        showToast(
          action === "apply"
            ? "Page migrated to layout v2."
            : action === "revert"
              ? "Old render restored."
              : "Old render deleted.",
          "success",
          3500,
        );
        setPreviewUrl(null);
        refresh();
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), "error", 6000);
    } finally {
      setBusy(null);
      setPendingAction(null);
    }
  };

  const selectedJob = selected ? byImage.get(selected.id) : undefined;
  const selectedActive = selectedJob && isActiveJob(selectedJob) ? selectedJob : null;
  const isMigrated = !!selected && isMigratedPage(selected);
  const comparisonPair =
    selected && (isMigrated || previewUrl)
      ? {
          id: selected.id,
          title: selected.fileName,
          sourceUrl: resolveImageUrl(isMigrated ? selected.legacyTranslatedUrl! : selected.translatedUrl),
          convertedUrl: resolveImageUrl(isMigrated ? selected.translatedUrl : previewUrl),
          createdAt: 0,
        }
      : null;

  return (
    <FullscreenShell
      open
      onClose={closeMigration}
      icon={<ArrowLeftRight />}
      title="Migrate to layout v2"
      subtitle={
        <Mono>
          {legacyPages.length} legacy {legacyPages.length === 1 ? "page" : "pages"} ·{" "}
          {migratedPages.length} to review · {migrationJobs.length} running
        </Mono>
      }
      actions={
        <>
          <Button
            variant="primary"
            icon={<ArrowLeftRight />}
            loading={busy === "start"}
            disabled={busy !== null || freeCount === 0}
            onClick={startAll}
          >
            <span>
              Migrate all (<Mono>{freeCount}</Mono>, free)
            </span>
          </Button>
          <Button
            variant="secondary"
            icon={<Sparkles />}
            loading={busy === "redetect"}
            disabled={busy !== null || legacyPages.length === 0}
            onClick={() => startRedetect()}
            title={
              needsRedetect
                ? `${pages(needsRedetect)} have no bubble data and can only be migrated this way.`
                : undefined
            }
          >
            <span>
              Re-detect with Gemini (<Mono>{legacyPages.length}</Mono>)
            </span>
          </Button>
          <Button
            variant="danger"
            icon={<Trash2 />}
            loading={busy === "cleanup"}
            disabled={busy !== null || migratedPages.length === 0}
            onClick={cleanup}
          >
            <span>
              Delete old renders (<Mono>{migratedPages.length}</Mono>)
            </span>
          </Button>
        </>
      }
    >
      <aside
        aria-label="Pages"
        className="custom-scrollbar w-72 shrink-0 overflow-y-auto border-r border-line bg-page p-2"
      >
        {reviewList.length === 0 ? (
          <p className="px-2 py-3 text-sm text-ink-3">Nothing to migrate or review in this series.</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {reviewList.map((image) => {
              const row = describeMigrationRow(image, byImage.get(image.id));
              const isSelected = image.id === selectedId;
              return (
                <li key={image.id}>
                  <button
                    type="button"
                    aria-current={isSelected || undefined}
                    onClick={() => setSelectedId(image.id)}
                    className={`w-full rounded-control px-2 py-1.5 text-left transition-colors duration-120 hover:bg-page-2 ${
                      isSelected ? "bg-npb shadow-[inset_2px_0_0_var(--c-action)]" : ""
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Mono className="shrink-0 text-xs text-ink-3">
                        p.{String(image.sequenceNumber).padStart(3, "0")}
                      </Mono>
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">{image.fileName}</span>
                    </span>
                    <span className="mt-1.5 flex items-center gap-2">
                      <StageBar stages={row.stages} label={row.label} size="sm" className="w-16 shrink-0" />
                      <span className={`truncate text-xs ${toneClass[row.tone]}`}>{row.label}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {selected ? (
          <>
            <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line bg-page px-3">
              <IconButton
                size="sm"
                label="Previous page"
                disabled={selectedIndex <= 0}
                onClick={() => setSelectedId(reviewList[selectedIndex - 1].id)}
              >
                <ChevronLeft />
              </IconButton>
              <IconButton
                size="sm"
                label="Next page"
                disabled={selectedIndex >= reviewList.length - 1}
                onClick={() => setSelectedId(reviewList[selectedIndex + 1].id)}
              >
                <ChevronRight />
              </IconButton>
              <span className="min-w-0 truncate text-sm text-ink">{selected.fileName}</span>
              {comparisonPair && (
                <>
                  <SegmentedControl
                    size="sm"
                    label="Comparison mode"
                    value={mode}
                    onChange={setMode}
                    options={MODE_OPTIONS}
                    className="ml-2"
                  />
                  <span className="text-xs text-ink-3">Left: old · Right: new</span>
                </>
              )}
              <div className="ml-auto flex items-center gap-1.5">
                {selectedActive ? (
                  <span className="flex items-center gap-1.5 text-xs text-action">
                    <Spinner size="xs" />
                    {describePageStatus(selected, selectedActive).label}
                  </span>
                ) : isMigrated ? (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<PencilLine />}
                      onClick={() => openLayoutEditor(selected)}
                    >
                      Open in layout editor
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Undo2 />}
                      disabled={busy !== null}
                      loading={pendingAction === "revert"}
                      onClick={() => pageAction(selected, "revert")}
                    >
                      Revert to old
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      icon={<Check />}
                      disabled={busy !== null}
                      loading={pendingAction === "drop-legacy"}
                      onClick={() => pageAction(selected, "drop-legacy")}
                    >
                      Accept and delete old
                    </Button>
                  </>
                ) : (
                  <>
                    {selected.hasLegacyBubbles && (
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<Eye />}
                        disabled={busy !== null}
                        loading={pendingAction === "preview"}
                        onClick={() => pageAction(selected, "preview")}
                      >
                        Preview (free)
                      </Button>
                    )}
                    {selected.hasLegacyBubbles && previewUrl && (
                      <Button
                        size="sm"
                        variant="primary"
                        icon={<Check />}
                        disabled={busy !== null}
                        loading={pendingAction === "apply"}
                        onClick={() => pageAction(selected, "apply")}
                      >
                        Apply
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Sparkles />}
                      disabled={busy !== null}
                      onClick={() => startRedetect([selected.id])}
                    >
                      Re-detect
                    </Button>
                  </>
                )}
              </div>
            </div>
            <div className="min-h-0 flex-1 bg-theater p-4">
              {comparisonPair ? (
                <ComparisonView pair={comparisonPair} mode={mode} />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <img
                    src={resolveImageUrl(selected.translatedUrl || selected.originalUrl)}
                    alt={selected.fileName}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center p-6">
            <EmptyState
              icon={<ImageOff />}
              title="Select a page on the left."
              description={
                reviewList.length === 0
                  ? "Nothing to migrate or review in this series."
                  : "Pick a page to compare the old and new renders."
              }
              textured={false}
              className="w-full max-w-sm"
            />
          </div>
        )}
      </div>
    </FullscreenShell>
  );
};

export default MigrationModal;
