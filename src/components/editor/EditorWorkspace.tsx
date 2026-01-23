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

const EditorWorkspace: React.FC = () => {
  // Selective store access for performance
  const series = useSeriesStore((state) => state.series);
  const activeSeriesId = useSeriesStore((state) => state.activeSeriesId);
  const setImages = useSeriesStore((state) => state.setImages);

  const toggleNewSeriesModal = useUIStore(
    (state) => state.toggleNewSeriesModal,
  );
  const setSelectedImageId = useUIStore((state) => state.setSelectedImageId);

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
    () => series.find((s) => s.id === activeSeriesId),
    [series, activeSeriesId],
  );

  const images = useMemo(() => activeSeries?.images || [], [activeSeries]);

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
    (id: string) => {
      setSelectedImageId(id);
    },
    [setSelectedImageId],
  );

  if (!activeSeries) {
    return (
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6 md:p-10">
        <EmptyWorkspace onAddSeries={() => toggleNewSeriesModal(true)} />
      </main>
    );
  }

  if (images.length === 0) {
    return (
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6 md:p-10">
        <NoImagesState
          seriesName={activeSeries.name}
          onUpload={handleFileUpload}
        />
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
                onSelect={handleSelectImage}
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
