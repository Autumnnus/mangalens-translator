import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useConfirm } from "../../hooks/useConfirm";
import { useImageProcessor } from "../../hooks/useImageProcessor";
import { useImageUpload } from "../../hooks/useImageUpload";
import { useSeriesStore } from "../../stores/useSeriesStore";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { useUIStore } from "../../stores/useUIStore";
import EditorHeader from "./EditorHeader";
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
  const setImages = useSeriesStore((state) => state.setImages);

  const { data: seriesListData } = useSeriesQuery();
  const { data: imagesData, isLoading: isImagesLoading } =
    useSeriesImagesQuery(activeSeriesId);

  const toggleNewSeriesModal = useUIStore(
    (state) => state.toggleNewSeriesModal,
  );
  const setSelectedImage = useUIStore((state) => state.setSelectedImage);

  const isViewOnly = useSettingsStore((state) => state.isViewOnly);

  const { confirm } = useConfirm();
  const { handleFileUpload } = useImageUpload();
  const { processAll, isProcessingAll } = useImageProcessor();

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

  const totalStats = useMemo(() => {
    return images.reduce(
      (acc, img) => ({
        tokens: acc.tokens + (img.usage?.totalTokenCount || 0),
        cost: acc.cost + (img.cost || 0),
      }),
      { tokens: 0, cost: 0 },
    );
  }, [images]);

  const [editorPage, setEditorPage] = useState(1);
  const [prevSeriesId, setPrevSeriesId] = useState(activeSeriesId);

  // If the active series changed, reset the page to 1 immediately during render
  if (activeSeriesId !== prevSeriesId) {
    setPrevSeriesId(activeSeriesId);
    setEditorPage(1);
  }

  const editorPageSize = 20;
  const totalEditorPages = Math.ceil(images.length / editorPageSize);

  const paginatedImages = useMemo(() => {
    const start = (editorPage - 1) * editorPageSize;
    return images.slice(start, start + editorPageSize);
  }, [images, editorPage]);

  const clearAll = useCallback(() => {
    confirm({
      title: "Wipe Series",
      message: "This will remove ALL images from this series. Are you sure?",
      onConfirm: () => {
        images.forEach((img) => {
          if (img.originalUrl.startsWith("blob:"))
            URL.revokeObjectURL(img.originalUrl);
        });
        if (activeSeriesId) {
          setImages(activeSeriesId, []);
        }
      },
      type: "danger",
    });
  }, [confirm, images, activeSeriesId, setImages]);

  const handleSelectImage = useCallback(
    (image: import("../../types").ProcessedImage) => {
      setSelectedImage(image);
    },
    [setSelectedImage],
  );

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
    <main className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6 md:p-10">
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
              />
            );
          }
          return (
            <ImageCard
              key={image.id}
              image={image}
              index={globalIndex}
              total={images.length}
            />
          );
        })}
      </div>

      <EditorPagination
        currentPage={editorPage}
        totalPages={totalEditorPages}
        onPageChange={setEditorPage}
      />
    </main>
  );
};

export default React.memo(EditorWorkspace);
