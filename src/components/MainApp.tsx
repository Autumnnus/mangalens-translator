"use client";

import React, { useEffect } from "react";
import CategoryManagerModal from "./CategoryManagerModal";
import ComparisonView from "./ComparisonView"; // For modal view
import ConfirmModal from "./ConfirmModal";
import NewSeriesModal from "./NewSeriesModal";
import SeriesSidebar from "./SeriesSidebar";
import SettingsModal from "./SettingsModal";
import EditorWorkspace from "./editor/EditorWorkspace";
import ReaderView from "./viewer/ReaderView";

import { useConfirm } from "../hooks/useConfirm";
import { useSeriesStore } from "../stores/useSeriesStore";
import { useSettingsStore } from "../stores/useSettingsStore";
import { useUIStore } from "../stores/useUIStore";
import { ViewMode } from "../types";

const MainApp: React.FC = () => {
  // Middleware handles auth redirect, so we can assume we are good or the calls will fail.
  // We can add useSession if we need user info later.

  // Store Hooks
  const {
    series,
    activeSeriesId,
    categories,
    rehydrateImages,
    deleteSeries,
    setActiveSeriesId,
    updateCategory,
    deleteCategory,
    addCategory,
    addSeries,
    updateSeries,
    page,
    pageSize,
    total,
    setPage,
  } = useSeriesStore();
  const { settings, updateSettings, isViewOnly } = useSettingsStore();
  const {
    toggleSidebar,
    isCategoryModalOpen,
    toggleCategoryModal,
    isNewSeriesModalOpen,
    toggleNewSeriesModal,
    isSettingsModalOpen,
    toggleSettingsModal,
    confirmConfig,
    editingSeriesId,
    setEditingSeriesId,
    selectedImageId,
    setSelectedImageId,
  } = useUIStore();
  const { confirm, close: closeConfirmModal } = useConfirm();

  const activeSeries = series.find((s) => s.id === activeSeriesId) || series[0];
  const images = activeSeries?.images || [];

  // Mount effects
  useEffect(() => {
    rehydrateImages();
  }, [rehydrateImages]);

  // State Wrappers for Sidebar/Modals (Adapting store actions to component props)
  const handleSelectSeries = (id: string) => {
    setActiveSeriesId(id);
    toggleSidebar(false);
  };

  const handleEditSeries = (id: string) => {
    setEditingSeriesId(id);
    toggleNewSeriesModal(true);
  };

  const handleConfirmSeries = (
    name: string,
    categoryName: string,
    sequenceNumber: number,
    categoryId?: string,
    metadata?: { author?: string; group?: string; originalTitle?: string },
  ) => {
    if (editingSeriesId) {
      updateSeries(editingSeriesId, {
        name,
        category: categoryName,
        categoryId: categoryId, // Pass ID if available
        sequenceNumber,
        author: metadata?.author,
        group: metadata?.group,
        originalTitle: metadata?.originalTitle,
      });
      setEditingSeriesId(null);
    } else {
      addSeries({
        id: Math.random().toString(36).substring(2, 9),
        name,
        description: "",
        category: categoryName,
        categoryId: categoryId,
        tags: [],
        images: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        sequenceNumber,
        author: metadata?.author,
        group: metadata?.group,
        originalTitle: metadata?.originalTitle,
      });
    }
    toggleNewSeriesModal(false);
  };

  const handleDeleteSeries = (id: string) => {
    const s = series.find((item) => item.id === id);
    confirm({
      title: "Delete Series",
      message: `Are you sure you want to delete "${s?.name}"? All associated images and metadata will be permanently removed.`,
      onConfirm: () => deleteSeries(id),
      type: "danger",
    });
  };

  const handleDeleteCategory = (id: string) => {
    const c = categories.find((item) => item.id === id);
    confirm({
      title: "Delete Category",
      message: `Are you sure you want to delete the category "${c?.name}"? Series inside this category will become uncategorized.`,
      onConfirm: () => deleteCategory(id),
      type: "danger",
    });
  };

  const selectedImg = selectedImageId
    ? images.find((i) => i.id === selectedImageId)
    : null;
  const [modalCompareMode, setModalCompareMode] =
    React.useState<ViewMode>("slider");

  // Prevent drag and drop on the entire window (optional, but good for local app feel)
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

  // No loading check needed as middleware handles protection

  return (
    <>
      <ConfirmModal
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        onConfirm={confirmConfig.onConfirm}
        onClose={closeConfirmModal}
        type={confirmConfig.type}
      />

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
          page={page}
          pageSize={pageSize}
          total={total}
          setPage={setPage}
          onMoveSeries={(seriesId, categoryId) => {
            const targetCategory = categories.find((c) => c.id === categoryId);
            updateSeries(seriesId, {
              categoryId,
              category: targetCategory?.name || "Uncategorized",
            });
          }}
          onMoveCategory={(categoryId, targetParentId) => {
            if (categoryId === targetParentId) return;
            updateCategory(
              categoryId,
              categories.find((c) => c.id === categoryId)?.name || "Unknown",
              targetParentId,
            );
          }}
        />

        <CategoryManagerModal
          isOpen={isCategoryModalOpen}
          onClose={() => toggleCategoryModal(false)}
          categories={categories}
          onUpdateCategory={updateCategory}
          onDeleteCategory={handleDeleteCategory}
          onAddCategory={addCategory}
        />

        <NewSeriesModal
          isOpen={isNewSeriesModalOpen}
          onClose={() => {
            toggleNewSeriesModal(false);
            setEditingSeriesId(null);
          }}
          onConfirm={handleConfirmSeries}
          existingTitles={series.map((s) => s.name)}
          categories={categories}
          onAddCategory={(name) => addCategory(name)}
          initialName={
            editingSeriesId
              ? series.find((s) => s.id === editingSeriesId)?.name
              : ""
          }
          initialCategory={
            editingSeriesId
              ? series.find((s) => s.id === editingSeriesId)?.category
              : ""
          }
          initialSequenceNumber={
            editingSeriesId
              ? series.find((s) => s.id === editingSeriesId)?.sequenceNumber
              : 0
          }
          initialAuthor={
            editingSeriesId
              ? series.find((s) => s.id === editingSeriesId)?.author
              : ""
          }
          initialGroup={
            editingSeriesId
              ? series.find((s) => s.id === editingSeriesId)?.group
              : ""
          }
          initialOriginalTitle={
            editingSeriesId
              ? series.find((s) => s.id === editingSeriesId)?.originalTitle
              : ""
          }
        />

        <SettingsModal
          isOpen={isSettingsModalOpen}
          onClose={() => toggleSettingsModal(false)}
          settings={settings}
          onSettingsChange={(newSettings) => {
            updateSettings(newSettings);
          }}
        />

        <div className="flex-1 flex flex-col h-full overflow-x-hidden overflow-y-auto custom-scrollbar relative">
          {isViewOnly ? <ReaderView /> : <EditorWorkspace />}
        </div>
      </div>

      {/* Full Screen Image Modal */}
      {selectedImg && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-sm flex flex-col items-center justify-center p-4 md:p-10"
          onClick={() => setSelectedImageId(null)}
        >
          <div
            className="w-full max-w-5xl h-full flex flex-col items-center justify-center gap-6 animate-in zoom-in-95 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            {selectedImg.translatedUrl && (
              <div className="bg-slate-800/50 p-2 rounded-full flex gap-2 border border-slate-700">
                {(["slider", "side-by-side", "toggle"] as ViewMode[]).map(
                  (mode) => (
                    <button
                      key={mode}
                      onClick={() => setModalCompareMode(mode)}
                      className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${
                        modalCompareMode === mode
                          ? "bg-indigo-600 text-white shadow-lg"
                          : "text-slate-400 hover:text-white hover:bg-slate-700"
                      }`}
                    >
                      {mode.replace(/-/g, " ")}
                    </button>
                  ),
                )}
              </div>
            )}

            <div className="w-full relative">
              <ComparisonView
                pair={{
                  id: selectedImg.id,
                  title: selectedImg.fileName,
                  sourceUrl: selectedImg.originalUrl,
                  convertedUrl:
                    selectedImg.translatedUrl || selectedImg.originalUrl,
                  createdAt: 0,
                }}
                mode={modalCompareMode}
              />
            </div>

            <button
              className="absolute top-8 right-8 text-white/50 hover:text-white text-3xl transition-colors"
              onClick={() => setSelectedImageId(null)}
            >
              <i className="fas fa-times"></i>
            </button>
          </div>
        </div>
      )}
      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmConfig.isOpen}
        onClose={closeConfirmModal}
        onConfirm={confirmConfig.onConfirm}
        title={confirmConfig.title}
        message={confirmConfig.message}
        type={confirmConfig.type}
      />
    </>
  );
};

export default MainApp;
