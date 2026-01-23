"use client";

import React, { useCallback, useEffect } from "react";
import GlobalModals from "./GlobalModals";
import SeriesSidebar from "./SeriesSidebar";
import EditorWorkspace from "./editor/EditorWorkspace";
import ReaderView from "./viewer/ReaderView";

import { useConfirm } from "../hooks/useConfirm";
import { useSeriesStore } from "../stores/useSeriesStore";
import { useSettingsStore } from "../stores/useSettingsStore";
import { useUIStore } from "../stores/useUIStore";

const MainApp: React.FC = () => {
  // Selective store access for performance
  const series = useSeriesStore((state) => state.series);
  const activeSeriesId = useSeriesStore((state) => state.activeSeriesId);
  const categories = useSeriesStore((state) => state.categories);
  const rehydrateImages = useSeriesStore((state) => state.rehydrateImages);
  const deleteSeries = useSeriesStore((state) => state.deleteSeries);
  const setActiveSeriesId = useSeriesStore((state) => state.setActiveSeriesId);
  const updateCategory = useSeriesStore((state) => state.updateCategory);
  const updateSeries = useSeriesStore((state) => state.updateSeries);

  const isViewOnly = useSettingsStore((state) => state.isViewOnly);

  const toggleSidebar = useUIStore((state) => state.toggleSidebar);
  const toggleCategoryModal = useUIStore((state) => state.toggleCategoryModal);
  const toggleNewSeriesModal = useUIStore(
    (state) => state.toggleNewSeriesModal,
  );
  const setEditingSeriesId = useUIStore((state) => state.setEditingSeriesId);

  const { confirm } = useConfirm();

  // Mount effects
  useEffect(() => {
    rehydrateImages();
  }, [rehydrateImages]);

  // Optimized callbacks
  const handleSelectSeries = useCallback(
    (id: string) => {
      setActiveSeriesId(id);
      toggleSidebar(false);
    },
    [setActiveSeriesId, toggleSidebar],
  );

  const handleEditSeries = useCallback(
    (id: string) => {
      setEditingSeriesId(id);
      toggleNewSeriesModal(true);
    },
    [setEditingSeriesId, toggleNewSeriesModal],
  );

  const handleDeleteSeries = useCallback(
    (id: string) => {
      const s = series.find((item) => item.id === id);
      confirm({
        title: "Delete Series",
        message: `Are you sure you want to delete "${s?.name}"? All associated images and metadata will be permanently removed.`,
        onConfirm: () => deleteSeries(id),
        type: "danger",
      });
    },
    [series, deleteSeries, confirm],
  );

  const handleMoveSeries = useCallback(
    (seriesId: string, categoryId: string) => {
      const targetCategory = categories.find((c) => c.id === categoryId);
      updateSeries(seriesId, {
        categoryId,
        category: targetCategory?.name || "Uncategorized",
      });
    },
    [categories, updateSeries],
  );

  const handleMoveCategory = useCallback(
    (categoryId: string, targetParentId: string | undefined) => {
      if (categoryId === targetParentId) return;
      updateCategory(
        categoryId,
        categories.find((c) => c.id === categoryId)?.name || "Unknown",
        targetParentId,
      );
    },
    [categories, updateCategory],
  );

  const handleAddSubcategory = useCallback(
    (parentId: string) => {
      toggleCategoryModal(true, parentId);
    },
    [toggleCategoryModal],
  );

  // Prevent drag and drop on the entire window
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => e.preventDefault();
    const handleDrop = (e: DragEvent) => e.preventDefault();
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", handleDrop);
    return () => {
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", handleDrop);
    };
  }, []);

  return (
    <>
      <GlobalModals />

      <div className="flex h-screen bg-background text-text-main font-sans overflow-hidden">
        <SeriesSidebar
          series={series}
          activeId={activeSeriesId}
          onSelect={handleSelectSeries}
          onAdd={() => toggleNewSeriesModal(true)}
          onDelete={handleDeleteSeries}
          onEdit={handleEditSeries}
          isViewOnly={isViewOnly}
          categories={categories}
          onMoveSeries={handleMoveSeries}
          onMoveCategory={handleMoveCategory}
          onAddSubcategory={handleAddSubcategory}
        />

        <div className="flex-1 flex flex-col h-full overflow-x-hidden overflow-y-auto custom-scrollbar relative">
          {isViewOnly ? <ReaderView /> : <EditorWorkspace />}
        </div>
      </div>
    </>
  );
};

export default React.memo(MainApp);
