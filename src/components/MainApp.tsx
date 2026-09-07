"use client";

import React, { Suspense, useCallback, useEffect, useMemo } from "react";
import {
  useCategoriesQuery,
  useUpdateCategoryMutation,
} from "../hooks/useCategoryQueries";
import { useConfirm } from "../hooks/useConfirm";
import {
  useDeleteSeriesMutation,
  useSeriesQuery,
  useSwapSeriesSequenceMutation,
  useUpdateSeriesMutation,
} from "../hooks/useSeriesQueries";
import { useUrlSync } from "../hooks/useUrlSync";
import { useSeriesStore } from "../stores/useSeriesStore";
import { useSettingsStore } from "../stores/useSettingsStore";
import { useUIStore } from "../stores/useUIStore";
import GlobalModals from "./GlobalModals";
import DocumentBar from "./layout/DocumentBar";
import SeriesSidebar from "./SeriesSidebar";
import { Spinner } from "./ui";

const ReaderView = React.lazy(() => import("./viewer/ReaderView"));
const EditorWorkspace = React.lazy(() => import("./editor/EditorWorkspace"));

const WorkspaceFallback: React.FC<{ label: string }> = ({ label }) => (
  <div className="flex flex-1 items-center justify-center">
    <div className="flex items-center gap-3 text-sm text-ink-2">
      <Spinner size="md" className="text-action" />
      {label}
    </div>
  </div>
);

const MainAppContent: React.FC = () => {
  useUrlSync();

  const activeSeriesId = useSeriesStore((state) => state.activeSeriesId);
  const setActiveSeriesId = useSeriesStore((state) => state.setActiveSeriesId);

  const { data: seriesData, isLoading: isSeriesLoading } = useSeriesQuery();
  const { data: categoriesData } = useCategoriesQuery();

  const { mutate: deleteSeries } = useDeleteSeriesMutation();
  const { mutate: updateSeries } = useUpdateSeriesMutation();
  const { mutate: updateCategory } = useUpdateCategoryMutation();
  const { mutate: swapSeriesSequence } = useSwapSeriesSequenceMutation();

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
  const setDefaultCategoryId = useUIStore(
    (state) => state.setDefaultCategoryId,
  );

  const { confirm } = useConfirm();

  const initializeSettings = useSettingsStore(
    (state) => state.initializeSettings,
  );

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await fetch("/api/settings", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });

        if (!response.ok) return;

        const dbSettings = await response.json();
        if (dbSettings) {
          initializeSettings(dbSettings);
        }
      } catch (error) {
        console.error("Failed to load user settings:", error);
      }
    };

    void loadSettings();
  }, [initializeSettings]);

  const handleSelectSeries = useCallback(
    (id: string) => {
      setActiveSeriesId(id);
      toggleSidebar(false);
    },
    [setActiveSeriesId, toggleSidebar],
  );

  const handleEditSeries = useCallback(
    (id: string) => {
      // "new:<categoryId>" opens the create form with that category preselected.
      if (id.startsWith("new:")) {
        const categoryId = id.substring(4);
        setDefaultCategoryId(categoryId);
        setEditingSeriesId(null);
      } else {
        setEditingSeriesId(id);
        setDefaultCategoryId(null);
      }
      toggleNewSeriesModal(true);
    },
    [setEditingSeriesId, setDefaultCategoryId, toggleNewSeriesModal],
  );

  const handleDeleteSeries = useCallback(
    (id: string) => {
      const target = series.find((item) => item.id === id);
      confirm({
        title: "Delete series",
        message: `Delete "${target?.name}"? All of its pages, translations and layouts will be removed permanently.`,
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
      const checkIsDescendant = (pId: string, cId: string): boolean => {
        const child = categories.find((c) => c.id === cId);
        if (!child || !child.parentId) return false;
        if (child.parentId === pId) return true;
        return checkIsDescendant(pId, child.parentId);
      };

      if (categoryId === targetParentId) return;

      // Never move a category into one of its own descendants.
      if (targetParentId && checkIsDescendant(categoryId, targetParentId)) {
        console.error(
          "Circular dependency detected: Cannot move parent into child",
        );
        return;
      }

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

  const handleMoveSeriesUpDown = useCallback(
    (id: string, direction: "up" | "down") => {
      const targetSeries = series.find((s) => s.id === id);
      if (!targetSeries) return;

      const siblings = series
        .filter((s) => s.categoryId === targetSeries.categoryId)
        .sort((a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0));

      const currentIndex = siblings.findIndex((s) => s.id === id);
      if (currentIndex === -1) return;

      let swapIndex = -1;
      if (direction === "up" && currentIndex > 0) {
        swapIndex = currentIndex - 1;
      } else if (direction === "down" && currentIndex < siblings.length - 1) {
        swapIndex = currentIndex + 1;
      }

      if (swapIndex !== -1) {
        const otherSeries = siblings[swapIndex];
        swapSeriesSequence({
          id1: targetSeries.id,
          id2: otherSeries.id,
        });
      }
    },
    [series, swapSeriesSequence],
  );

  // Stop the browser from opening dropped files anywhere in the window.
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

      <div className="flex h-dvh overflow-hidden bg-paper text-ink">
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
          onMoveSeriesUpDown={handleMoveSeriesUpDown}
          isLoading={isLoading}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          {!isViewOnly && <DocumentBar />}
          <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
            <Suspense
              fallback={
                <WorkspaceFallback
                  label={isViewOnly ? "Opening reader…" : "Opening editor…"}
                />
              }
            >
              {isViewOnly ? <ReaderView /> : <EditorWorkspace />}
            </Suspense>
          </div>
        </div>
      </div>
    </>
  );
};

const MainApp: React.FC = () => {
  return (
    <Suspense fallback={<WorkspaceFallback label="Loading…" />}>
      <MainAppContent />
    </Suspense>
  );
};

export default React.memo(MainApp);
