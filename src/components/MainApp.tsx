"use client";

import React, { useCallback, useEffect, useMemo } from "react";
import {
  useCategoriesQuery,
  useUpdateCategoryMutation,
} from "../hooks/useCategoryQueries";
import { useConfirm } from "../hooks/useConfirm";
import {
  useDeleteSeriesMutation,
  useSeriesQuery,
  useUpdateSeriesMutation,
} from "../hooks/useSeriesQueries";
import { useSeriesStore } from "../stores/useSeriesStore";
import { useSettingsStore } from "../stores/useSettingsStore";
import { useUIStore } from "../stores/useUIStore";
import GlobalModals from "./GlobalModals";
import SeriesSidebar from "./SeriesSidebar";

const ReaderView = React.lazy(() => import("./viewer/ReaderView"));
const EditorWorkspace = React.lazy(() => import("./editor/EditorWorkspace"));

const MainApp: React.FC = () => {
  // Selective store access for performance
  const activeSeriesId = useSeriesStore((state) => state.activeSeriesId);
  const setActiveSeriesId = useSeriesStore((state) => state.setActiveSeriesId);

  // TanStack Queries
  const { data: seriesData, isLoading: isSeriesLoading } = useSeriesQuery();
  const { data: categoriesData } = useCategoriesQuery();

  // Mutations
  const { mutate: deleteSeries } = useDeleteSeriesMutation();
  const { mutate: updateSeries } = useUpdateSeriesMutation();
  const { mutate: updateCategory } = useUpdateCategoryMutation();

  const series = useMemo(() => seriesData?.items || [], [seriesData]);
  const categories = useMemo(() => categoriesData || [], [categoriesData]);
  const isLoading = isSeriesLoading;

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
    // setActiveSeriesId(null);
  }, []);

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
      updateSeries({
        id: seriesId,
        updates: {
          categoryId,
        },
      });
    },
    [updateSeries],
  );

  const handleMoveCategory = useCallback(
    (categoryId: string, targetParentId: string | undefined) => {
      if (categoryId === targetParentId) return;
      updateCategory({
        id: categoryId,
        name: categories.find((c) => c.id === categoryId)?.name || "Unknown",
        parentId: targetParentId,
      });
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
          isLoading={isLoading}
        />

        <div className="flex-1 flex flex-col h-full overflow-x-hidden overflow-y-auto custom-scrollbar relative">
          <React.Suspense
            fallback={
              <div className="flex-1 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                  <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
                  <p className="text-text-muted animate-pulse">
                    Preparing Workspace...
                  </p>
                </div>
              </div>
            }
          >
            {isViewOnly ? <ReaderView /> : <EditorWorkspace />}
          </React.Suspense>
        </div>
      </div>
    </>
  );
};

export default React.memo(MainApp);
