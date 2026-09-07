"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useConfirm } from "../../hooks/useConfirm";
import {
  useBulkDeleteImagesMutation,
  useBulkSetImageStatusMutation,
  useDeleteImageMutation,
  useReorderImagesMutation,
  useSetImageStatusMutation,
} from "../../hooks/useImageMutations";
import { useImageProcessor } from "../../hooks/useImageProcessor";
import { useImageUpload } from "../../hooks/useImageUpload";
import { usePageJobs } from "../../hooks/usePageJobs";
import {
  useSeriesImagesQuery,
  useSeriesQuery,
} from "../../hooks/useSeriesQueries";
import { useSeriesStore } from "../../stores/useSeriesStore";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { useUIStore } from "../../stores/useUIStore";
import { ProcessedImage } from "../../types";
import { describePageStatus } from "../../utils/stages";
import { Skeleton } from "../ui";
import EditorBulkActions from "./EditorBulkActions";
import EditorPagination from "./EditorPagination";
import EditorToolbar, { PageFilter, ViewMode } from "./EditorToolbar";
import EmptyWorkspace from "./EmptyWorkspace";
import ImageCard from "./ImageCard";
import ListViewItem from "./ListViewItem";
import NoImagesState from "./NoImagesState";

const PAGE_SIZE = 20;
const VIEW_MODE_KEY = "mangalens_editor_viewmode";

const readViewMode = (): ViewMode => {
  if (typeof window === "undefined") return "grid";
  const saved = localStorage.getItem(VIEW_MODE_KEY);
  if (saved === "grid" || saved === "list" || saved === "large") return saved;
  if (saved === "detail") return "large";
  return "grid";
};

const EditorWorkspace: React.FC = () => {
  const activeSeriesId = useSeriesStore((state) => state.activeSeriesId);

  const editorPage = useUIStore((state) => state.editorPage);
  const setEditorPage = useUIStore((state) => state.setEditorPage);
  const toggleNewSeriesModal = useUIStore((state) => state.toggleNewSeriesModal);
  const setSelectedImage = useUIStore((state) => state.setSelectedImage);
  const openLayoutEditor = useUIStore((state) => state.openLayoutEditor);
  const openMigration = useUIStore((state) => state.openMigration);
  const showToast = useUIStore((state) => state.showToast);

  const isViewOnly = useSettingsStore((state) => state.isViewOnly);
  const developerMode = useSettingsStore(
    (state) => state.settings.developerMode === true,
  );
  const batchSize = useSettingsStore((state) => state.settings.batchSize ?? 10);
  const updateSettings = useSettingsStore((state) => state.updateSettings);

  const { data: seriesListData } = useSeriesQuery();
  const { data: imagesData, isLoading: isImagesLoading } =
    useSeriesImagesQuery(activeSeriesId);
  const { byImage } = usePageJobs(activeSeriesId);

  const { confirm } = useConfirm();
  const { handleFileUpload, isUploading } = useImageUpload();
  const { processAll, processImage, cancelProcessing, isProcessingAll } =
    useImageProcessor();
  const { mutate: reorderImages } = useReorderImagesMutation();
  const { mutate: deleteImage } = useDeleteImageMutation();
  const { mutateAsync: setImageStatus } = useSetImageStatusMutation();
  const { mutateAsync: bulkDeleteImages, isPending: isBulkDeleting } =
    useBulkDeleteImagesMutation();
  const { mutateAsync: bulkSetImageStatus, isPending: isBulkStatusUpdating } =
    useBulkSetImageStatusMutation();

  const workspaceRef = useRef<HTMLElement>(null);
  const previousSeriesIdRef = useRef(activeSeriesId);
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(
    new Set(),
  );
  const [isBulkTranslating, setIsBulkTranslating] = useState(false);
  const [filter, setFilter] = useState<PageFilter>("all");
  const [viewMode, setViewMode] = useState<ViewMode>(readViewMode);

  useEffect(() => {
    localStorage.setItem(VIEW_MODE_KEY, viewMode);
  }, [viewMode]);

  const activeSeries = useMemo(
    () => seriesListData?.items.find((s) => s.id === activeSeriesId),
    [seriesListData, activeSeriesId],
  );

  const images = useMemo(() => imagesData || [], [imagesData]);

  const migrationCount = useMemo(
    () =>
      images.filter(
        (image) =>
          (image.layoutVersion === 1 && !!image.translatedUrl) ||
          (image.layoutVersion === 2 && !!image.legacyTranslatedUrl),
      ).length,
    [images],
  );

  // One status view per page, shared by filters, counts and rows.
  const statusById = useMemo(() => {
    const map = new Map<string, ReturnType<typeof describePageStatus>>();
    for (const image of images) {
      map.set(image.id, describePageStatus(image, byImage.get(image.id)));
    }
    return map;
  }, [images, byImage]);

  const counts = useMemo(() => {
    const result = { all: images.length, running: 0, failed: 0, done: 0, idle: 0 };
    for (const image of images) {
      const view = statusById.get(image.id);
      if (!view) continue;
      if (view.active) result.running += 1;
      else if (view.tone === "danger") result.failed += 1;
      else if (image.status === "completed") result.done += 1;
      else result.idle += 1;
    }
    return result;
  }, [images, statusById]);

  const filteredImages = useMemo(() => {
    if (filter === "all") return images;
    return images.filter((image) => {
      const view = statusById.get(image.id);
      if (!view) return false;
      switch (filter) {
        case "running":
          return view.active;
        case "failed":
          return !view.active && view.tone === "danger";
        case "done":
          return !view.active && image.status === "completed";
        case "idle":
          return !view.active && view.tone !== "danger" && image.status !== "completed";
      }
    });
  }, [filter, images, statusById]);

  const totalEditorPages = Math.max(
    1,
    Math.ceil(filteredImages.length / PAGE_SIZE),
  );

  const paginatedImages = useMemo(() => {
    const start = (editorPage - 1) * PAGE_SIZE;
    return filteredImages.slice(start, start + PAGE_SIZE);
  }, [filteredImages, editorPage]);

  useEffect(() => {
    if (activeSeriesId === previousSeriesIdRef.current) return;
    previousSeriesIdRef.current = activeSeriesId;
    setEditorPage(1);
    setSelectedImageIds(new Set());
    setFilter("all");
  }, [activeSeriesId, setEditorPage]);

  useEffect(() => {
    if (editorPage > totalEditorPages) {
      setEditorPage(totalEditorPages);
    }
  }, [editorPage, setEditorPage, totalEditorPages]);

  useEffect(() => {
    const imageIds = new Set(images.map((image) => image.id));
    setSelectedImageIds((current) => {
      const next = new Set([...current].filter((id) => imageIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [images]);

  const handleFilterChange = useCallback(
    (next: PageFilter) => {
      setFilter(next);
      setEditorPage(1);
    },
    [setEditorPage],
  );

  const handlePageChange = useCallback(
    (page: number) => {
      setEditorPage(page);
      workspaceRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    },
    [setEditorPage],
  );

  const toggleImageSelection = useCallback((imageId: string) => {
    setSelectedImageIds((current) => {
      const next = new Set(current);
      if (next.has(imageId)) {
        next.delete(imageId);
      } else {
        next.add(imageId);
      }
      return next;
    });
  }, []);

  const isPageSelected =
    paginatedImages.length > 0 &&
    paginatedImages.every((image) => selectedImageIds.has(image.id));

  const togglePageSelection = useCallback(() => {
    setSelectedImageIds((current) => {
      const next = new Set(current);
      const pageIsSelected = paginatedImages.every((image) =>
        next.has(image.id),
      );
      for (const image of paginatedImages) {
        if (pageIsSelected) {
          next.delete(image.id);
        } else {
          next.add(image.id);
        }
      }
      return next;
    });
  }, [paginatedImages]);

  const selectAllImages = useCallback(() => {
    setSelectedImageIds(new Set(filteredImages.map((image) => image.id)));
  }, [filteredImages]);

  const clearSelection = useCallback(() => setSelectedImageIds(new Set()), []);

  const clearAll = useCallback(() => {
    confirm({
      title: "Delete all pages",
      message:
        "This removes every page in this series, including translations. This cannot be undone.",
      onConfirm: () => {
        if (!activeSeriesId || images.length === 0) return;
        void bulkDeleteImages({
          seriesId: activeSeriesId,
          imageIds: images.map((image) => image.id),
        })
          .then(() => {
            setSelectedImageIds(new Set());
            showToast("All pages deleted.", "success", 3500);
          })
          .catch((error: unknown) => {
            showToast(
              error instanceof Error ? error.message : "Could not delete pages.",
              "error",
              5000,
            );
          });
      },
      type: "danger",
    });
  }, [activeSeriesId, bulkDeleteImages, confirm, images, showToast]);

  const handleOpenImage = useCallback(
    (image: ProcessedImage) => setSelectedImage(image),
    [setSelectedImage],
  );

  const handleMoveImage = useCallback(
    (imageId: string, dir: "up" | "down" | "jump", targetPos?: number) => {
      const currentIndex = images.findIndex((img) => img.id === imageId);
      if (currentIndex === -1) return;

      const newImages = [...images];

      if (dir === "jump" && targetPos !== undefined) {
        const [item] = newImages.splice(currentIndex, 1);
        const insertIdx = Math.max(
          0,
          Math.min(targetPos - 1, newImages.length),
        );
        newImages.splice(insertIdx, 0, item);
      } else {
        const targetIndex = dir === "up" ? currentIndex - 1 : currentIndex + 1;
        if (targetIndex < 0 || targetIndex >= newImages.length) return;

        [newImages[currentIndex], newImages[targetIndex]] = [
          newImages[targetIndex],
          newImages[currentIndex],
        ];
      }

      const orderedIds = newImages.map((img) => img.id);
      if (activeSeriesId) {
        reorderImages({ seriesId: activeSeriesId, imageIds: orderedIds });
      }
    },
    [images, activeSeriesId, reorderImages],
  );

  const handleTranslateImage = useCallback(
    (image: ProcessedImage) => {
      if (image.status === "completed") {
        confirm({
          title: "Translate again?",
          message: `${image.fileName} already has a translation. Translating again replaces it and its usage data.`,
          onConfirm: () => void processImage(image, 0, true),
          type: "warning",
        });
      } else {
        void processImage(image, 0, true);
      }
    },
    [confirm, processImage],
  );

  const handleCancelImage = useCallback(
    (image: ProcessedImage) => void cancelProcessing(image.id),
    [cancelProcessing],
  );

  const handleDeleteImage = useCallback(
    (image: ProcessedImage) => {
      confirm({
        title: "Delete page",
        message: `Delete ${image.fileName}? This cannot be undone.`,
        onConfirm: () => {
          if (image.originalUrl.startsWith("blob:"))
            URL.revokeObjectURL(image.originalUrl);
          if (activeSeriesId) {
            deleteImage({ seriesId: activeSeriesId, imageId: image.id });
          }
        },
        type: "danger",
      });
    },
    [activeSeriesId, confirm, deleteImage],
  );

  const handleSetStatus = useCallback(
    async (image: ProcessedImage, status: ProcessedImage["status"]) => {
      if (!activeSeriesId || status === image.status) return;
      try {
        await setImageStatus({ seriesId: activeSeriesId, imageId: image.id, status });
        showToast(`${image.fileName}: marked ${status}.`, "success", 3000);
      } catch (error) {
        showToast(
          error instanceof Error ? error.message : "Could not update the page.",
          "error",
          4500,
        );
      }
    },
    [activeSeriesId, setImageStatus, showToast],
  );

  const handleBulkStatusChange = useCallback(
    (status: ProcessedImage["status"]) => {
      const imageIds = [...selectedImageIds];
      if (!activeSeriesId || imageIds.length === 0) return;

      void bulkSetImageStatus({ seriesId: activeSeriesId, imageIds, status })
        .then(() => {
          showToast(
            `${imageIds.length} page${imageIds.length === 1 ? "" : "s"} marked ${status}.`,
            "success",
            3500,
          );
        })
        .catch((error: unknown) => {
          showToast(
            error instanceof Error ? error.message : "Could not update pages.",
            "error",
            5000,
          );
        });
    },
    [activeSeriesId, bulkSetImageStatus, selectedImageIds, showToast],
  );

  const handleTranslateSelected = useCallback(async () => {
    const selectedImages = images.filter(
      (image) =>
        selectedImageIds.has(image.id) && image.status !== "processing",
    );
    if (selectedImages.length === 0 || isBulkTranslating || isProcessingAll) {
      return;
    }

    setIsBulkTranslating(true);
    showToast(
      `Queuing ${selectedImages.length} selected page${selectedImages.length === 1 ? "" : "s"}…`,
      "info",
      4000,
    );

    try {
      let completed = 0;
      for (const image of selectedImages) {
        if (await processImage(image, 0, true)) completed += 1;
      }
      showToast(
        `${completed}/${selectedImages.length} selected pages queued.`,
        completed === selectedImages.length ? "success" : "info",
        5000,
      );
    } finally {
      setIsBulkTranslating(false);
    }
  }, [images, isBulkTranslating, isProcessingAll, processImage, selectedImageIds, showToast]);

  const handleDeleteSelected = useCallback(() => {
    const imageIds = [...selectedImageIds];
    if (!activeSeriesId || imageIds.length === 0) return;

    confirm({
      title: "Delete selected pages",
      message: `Delete ${imageIds.length} selected page${imageIds.length === 1 ? "" : "s"}? This cannot be undone.`,
      onConfirm: () => {
        void bulkDeleteImages({ seriesId: activeSeriesId, imageIds })
          .then(() => {
            setSelectedImageIds(new Set());
            showToast(
              `${imageIds.length} page${imageIds.length === 1 ? "" : "s"} deleted.`,
              "success",
              3500,
            );
          })
          .catch((error: unknown) => {
            showToast(
              error instanceof Error ? error.message : "Could not delete pages.",
              "error",
              5000,
            );
          });
      },
      type: "danger",
    });
  }, [activeSeriesId, bulkDeleteImages, confirm, selectedImageIds, showToast]);

  const containerClass = "mx-auto w-full max-w-[1400px] px-4 py-4 sm:px-6";

  if (!activeSeries) {
    return (
      <main className={`flex flex-1 flex-col ${containerClass}`}>
        <EmptyWorkspace onAddSeries={() => toggleNewSeriesModal(true)} />
      </main>
    );
  }

  if (isImagesLoading) {
    return (
      <main className={containerClass} aria-busy="true">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-10" />
          <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {[...Array(10)].map((_, i) => (
              <Skeleton key={i} className="aspect-[2/3]" />
            ))}
          </div>
        </div>
      </main>
    );
  }

  if (images.length === 0 && (activeSeries.imageCount || 0) === 0) {
    return (
      <main className={`flex flex-1 flex-col ${containerClass}`}>
        <NoImagesState
          seriesName={activeSeries.name}
          onUpload={handleFileUpload}
          isUploading={isUploading}
        />
      </main>
    );
  }

  if (images.length === 0 && (activeSeries.imageCount || 0) > 0) {
    // imageCount is positive but the page list is empty: still signing URLs.
    return (
      <main className={containerClass} aria-busy="true">
        <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {[...Array(Math.min(10, activeSeries.imageCount || 10))].map((_, i) => (
            <Skeleton key={i} className="aspect-[2/3]" />
          ))}
        </div>
      </main>
    );
  }

  const hasSelection = selectedImageIds.size > 0;
  const bulkBusy =
    isBulkDeleting || isBulkStatusUpdating || isBulkTranslating || isProcessingAll;

  return (
    <main ref={workspaceRef} className={containerClass}>
      <div className="sticky top-0 z-(--z-bar) -mx-4 mb-4 bg-paper px-4 pb-2 pt-1 sm:-mx-6 sm:px-6">
        {hasSelection && !isViewOnly ? (
          <EditorBulkActions
            selectedCount={selectedImageIds.size}
            totalCount={filteredImages.length}
            isPageSelected={isPageSelected}
            isBusy={bulkBusy}
            onTogglePage={togglePageSelection}
            onSelectAll={selectAllImages}
            onClear={clearSelection}
            onStatusChange={handleBulkStatusChange}
            onTranslate={() => void handleTranslateSelected()}
            onDelete={handleDeleteSelected}
          />
        ) : (
          <EditorToolbar
            counts={counts}
            filter={filter}
            onFilterChange={handleFilterChange}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            isProcessingAll={isProcessingAll}
            canTranslateAll={counts.idle + counts.failed > 0}
            onTranslateAll={() => void processAll()}
            batchSize={batchSize}
            onBatchSizeChange={(size) => updateSettings({ batchSize: size })}
            onUpload={handleFileUpload}
            isUploading={isUploading}
            migrationCount={migrationCount}
            onOpenMigration={() => activeSeriesId && openMigration(activeSeriesId)}
            onWipe={clearAll}
            onSelectPage={togglePageSelection}
            isViewOnly={isViewOnly}
          />
        )}
      </div>

      <EditorPagination
        currentPage={editorPage}
        totalPages={totalEditorPages}
        onPageChange={handlePageChange}
        placement="top"
      />

      {paginatedImages.length === 0 ? (
        <p className="py-16 text-center text-sm text-ink-3">
          No pages match this filter.
        </p>
      ) : viewMode === "list" ? (
        <ul className="flex flex-col gap-1 pb-8" aria-label="Pages">
          {paginatedImages.map((image) => (
            <ListViewItem
              key={image.id}
              image={image}
              status={statusById.get(image.id)!}
              isSelected={selectedImageIds.has(image.id)}
              onToggleSelect={isViewOnly ? undefined : () => toggleImageSelection(image.id)}
              onOpen={() => handleOpenImage(image)}
              onOpenEditor={() => openLayoutEditor(image)}
              onTranslate={() => handleTranslateImage(image)}
              onCancel={() => handleCancelImage(image)}
              onDelete={() => handleDeleteImage(image)}
              onSetStatus={(status) => void handleSetStatus(image, status)}
              readOnly={isViewOnly}
            />
          ))}
        </ul>
      ) : (
        <ul
          aria-label="Pages"
          className={
            viewMode === "large"
              ? "grid grid-cols-1 gap-4 pb-8 md:grid-cols-2 xl:grid-cols-3"
              : "grid grid-cols-1 gap-3 pb-8 min-[480px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
          }
        >
          {paginatedImages.map((image) => {
            const globalIndex = images.findIndex((item) => item.id === image.id);
            return (
              <ImageCard
                key={image.id}
                image={image}
                index={globalIndex}
                total={images.length}
                status={statusById.get(image.id)!}
                isSelected={selectedImageIds.has(image.id)}
                onToggleSelect={isViewOnly ? undefined : () => toggleImageSelection(image.id)}
                onOpen={() => handleOpenImage(image)}
                onOpenEditor={() => openLayoutEditor(image)}
                onTranslate={() => handleTranslateImage(image)}
                onCancel={() => handleCancelImage(image)}
                onDelete={() => handleDeleteImage(image)}
                onSetStatus={(status) => void handleSetStatus(image, status)}
                onMove={(dir, targetPos) => handleMoveImage(image.id, dir, targetPos)}
                developerMode={developerMode}
                readOnly={isViewOnly}
                large={viewMode === "large"}
              />
            );
          })}
        </ul>
      )}

      <EditorPagination
        currentPage={editorPage}
        totalPages={totalEditorPages}
        onPageChange={handlePageChange}
      />
    </main>
  );
};

export default React.memo(EditorWorkspace);
