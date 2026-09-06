import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConfirm } from "../../hooks/useConfirm";
import {
  useBulkDeleteImagesMutation,
  useBulkSetImageStatusMutation,
  useReorderImagesMutation,
} from "../../hooks/useImageMutations";
import { useImageProcessor } from "../../hooks/useImageProcessor";
import { useImageUpload } from "../../hooks/useImageUpload";
import { useSeriesStore } from "../../stores/useSeriesStore";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { useUIStore } from "../../stores/useUIStore";
import EditorHeader from "./EditorHeader";
import EditorBulkActions from "./EditorBulkActions";
import EditorPagination from "./EditorPagination";
import EmptyWorkspace from "./EmptyWorkspace";
import ImageCard from "./ImageCard";
import ListViewItem from "./ListViewItem";
import NoImagesState from "./NoImagesState";

import {
  useSeriesImagesQuery,
  useSeriesQuery,
} from "../../hooks/useSeriesQueries";

const EditorWorkspace: React.FC = () => {
  // Selective store access for performance
  const activeSeriesId = useSeriesStore((state) => state.activeSeriesId);

  const editorPage = useUIStore((state) => state.editorPage);
  const setEditorPage = useUIStore((state) => state.setEditorPage);

  const { data: seriesListData } = useSeriesQuery();
  const { data: imagesData, isLoading: isImagesLoading } =
    useSeriesImagesQuery(activeSeriesId);

  const toggleNewSeriesModal = useUIStore(
    (state) => state.toggleNewSeriesModal,
  );
  const setSelectedImage = useUIStore((state) => state.setSelectedImage);
  const showToast = useUIStore((state) => state.showToast);

  const isViewOnly = useSettingsStore((state) => state.isViewOnly);

  const { confirm } = useConfirm();
  const { handleFileUpload, isUploading } = useImageUpload();
  const { processAll, processImage, isProcessingAll } = useImageProcessor();
  const openMigration = useUIStore((state) => state.openMigration);
  const { mutate: reorderImages } = useReorderImagesMutation();
  const {
    mutateAsync: bulkDeleteImages,
    isPending: isBulkDeleting,
  } = useBulkDeleteImagesMutation();
  const {
    mutateAsync: bulkSetImageStatus,
    isPending: isBulkStatusUpdating,
  } = useBulkSetImageStatusMutation();

  const workspaceRef = useRef<HTMLElement>(null);
  const previousSeriesIdRef = useRef(activeSeriesId);
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(
    new Set(),
  );
  const [isBulkTranslating, setIsBulkTranslating] = useState(false);

  const [viewMode, setViewMode] = useState<"grid" | "list" | "detail">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("mangalens_editor_viewmode");
      if (saved === "grid" || saved === "list" || saved === "detail")
        return saved;
    }
    return "grid";
  });

  useEffect(() => {
    localStorage.setItem("mangalens_editor_viewmode", viewMode);
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

  const totalStats = useMemo(() => {
    return images.reduce(
      (acc, img) => ({
        tokens: acc.tokens + (img.usage?.totalTokenCount || 0),
        cost: acc.cost + (img.cost || 0),
      }),
      { tokens: 0, cost: 0 },
    );
  }, [images]);

  const editorPageSize = 20;
  const totalEditorPages = Math.max(1, Math.ceil(images.length / editorPageSize));

  const paginatedImages = useMemo(() => {
    const start = (editorPage - 1) * editorPageSize;
    return images.slice(start, start + editorPageSize);
  }, [images, editorPage]);

  useEffect(() => {
    if (activeSeriesId === previousSeriesIdRef.current) return;
    previousSeriesIdRef.current = activeSeriesId;
    setEditorPage(1);
    setSelectedImageIds(new Set());
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
    setSelectedImageIds(new Set(images.map((image) => image.id)));
  }, [images]);

  const clearAll = useCallback(() => {
    confirm({
      title: "Wipe Series",
      message: "This will remove ALL images from this series. Are you sure?",
      onConfirm: () => {
        if (!activeSeriesId || images.length === 0) return;
        void bulkDeleteImages({
          seriesId: activeSeriesId,
          imageIds: images.map((image) => image.id),
        })
          .then(() => {
            setSelectedImageIds(new Set());
            showToast("All pages were deleted.", "success", 3500);
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

  const handleSelectImage = useCallback(
    (image: import("../../types").ProcessedImage) => {
      setSelectedImage(image);
    },
    [setSelectedImage],
  );

  const handleMoveImage = useCallback(
    (imageId: string, dir: "up" | "down" | "jump", targetPos?: number) => {
      if (!images) return;

      const currentIndex = images.findIndex((img) => img.id === imageId);
      if (currentIndex === -1) return;

      const newImages = [...images];

      if (dir === "jump" && targetPos !== undefined) {
        // targetPos is 1-based sequence number
        const [item] = newImages.splice(currentIndex, 1);
        // Convert to 0-based index, clamp
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

  const handleBulkStatusChange = useCallback(
    (status: import("../../types").ProcessedImage["status"]) => {
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
      `Translating ${selectedImages.length} selected page${selectedImages.length === 1 ? "" : "s"}.`,
      "info",
      4000,
    );

    try {
      let completed = 0;
      for (const image of selectedImages) {
        if (await processImage(image, 0, true)) completed += 1;
      }
      showToast(
        `Selected translation finished: ${completed}/${selectedImages.length}.`,
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
      title: "Delete Selected Pages",
      message: `This will permanently remove ${imageIds.length} selected page${imageIds.length === 1 ? "" : "s"}. Are you sure?`,
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

  if (!activeSeries) {
    return (
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6 md:p-10">
        <EmptyWorkspace onAddSeries={() => toggleNewSeriesModal(true)} />
      </main>
    );
  }

  if (isImagesLoading) {
    return (
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6 md:p-10">
        <div className="flex flex-col gap-10">
          <div className="h-32 bg-surface-muted/30 rounded-[3rem] animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                className="aspect-[2/3] bg-surface-muted/30 rounded-[2rem] animate-pulse border border-border-muted"
              />
            ))}
          </div>
        </div>
      </main>
    );
  }

  if (images.length === 0 && (activeSeries.imageCount || 0) === 0) {
    return (
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6 md:p-10">
        <NoImagesState
          seriesName={activeSeries.name}
          onUpload={handleFileUpload}
          isUploading={isUploading}
        />
      </main>
    );
  }

  if (images.length === 0 && (activeSeries.imageCount || 0) > 0) {
    // This case covers when imageCount is positive but images array is empty (should not happen with autozustand but good for safety)
    return (
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6 md:p-10 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-text-muted animate-pulse">Loading Images...</p>
        </div>
      </main>
    );
  }

  return (
    <main
      ref={workspaceRef}
      className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6 md:p-10"
    >
      <EditorHeader
        activeSeries={activeSeries}
        totalStats={totalStats}
        imageCount={images.length}
        isProcessingAll={isProcessingAll}
        onProcessAll={processAll}
        viewMode={viewMode}
        setViewMode={setViewMode}
        isViewOnly={isViewOnly}
        onUpload={handleFileUpload}
        onWipe={clearAll}
        migrationCount={migrationCount}
        onOpenMigration={() => activeSeriesId && openMigration(activeSeriesId)}
      />

      {!isViewOnly && (
        <EditorBulkActions
          selectedCount={selectedImageIds.size}
          totalCount={images.length}
          isPageSelected={isPageSelected}
          isBusy={
            isBulkDeleting ||
            isBulkStatusUpdating ||
            isBulkTranslating ||
            isProcessingAll
          }
          onTogglePage={togglePageSelection}
          onSelectAll={selectAllImages}
          onClear={() => setSelectedImageIds(new Set())}
          onStatusChange={handleBulkStatusChange}
          onTranslate={() => void handleTranslateSelected()}
          onDelete={handleDeleteSelected}
        />
      )}

      <EditorPagination
        currentPage={editorPage}
        totalPages={totalEditorPages}
        onPageChange={handlePageChange}
        placement="top"
      />

      <div
        className={`pb-12 ${
          viewMode === "grid"
            ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
            : viewMode === "list"
              ? "space-y-2"
              : "space-y-12 max-w-4xl mx-auto"
        }`}
      >
        {paginatedImages.map((image, idx) => {
          const globalIndex = (editorPage - 1) * editorPageSize + idx;
          if (viewMode === "list") {
            return (
              <ListViewItem
                key={image.id}
                image={image}
                onSelect={() => handleSelectImage(image)}
                isSelected={selectedImageIds.has(image.id)}
                onToggleSelect={() => toggleImageSelection(image.id)}
              />
            );
          }
          return (
            <ImageCard
              key={image.id}
              image={image}
              index={globalIndex}
              total={images.length}
              onMove={(dir, targetPos) =>
                handleMoveImage(image.id, dir, targetPos)
              }
              isSelected={selectedImageIds.has(image.id)}
              onToggleSelect={() => toggleImageSelection(image.id)}
            />
          );
        })}
      </div>

      <EditorPagination
        currentPage={editorPage}
        totalPages={totalEditorPages}
        onPageChange={handlePageChange}
      />
    </main>
  );
};

export default React.memo(EditorWorkspace);
