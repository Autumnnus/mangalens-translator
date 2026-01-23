import React, { useCallback } from "react";
import { useConfirm } from "../hooks/useConfirm";
import { useSeriesStore } from "../stores/useSeriesStore";
import { useSettingsStore } from "../stores/useSettingsStore";
import { useUIStore } from "../stores/useUIStore";
import { ViewMode } from "../types";
import CategoryManagerModal from "./CategoryManagerModal";
import ComparisonView from "./ComparisonView";
import ConfirmModal from "./ConfirmModal";
import NewSeriesModal from "./NewSeriesModal";
import SettingsModal from "./SettingsModal";

const GlobalModals: React.FC = () => {
  const {
    isCategoryModalOpen,
    toggleCategoryModal,
    isNewSeriesModalOpen,
    toggleNewSeriesModal,
    isSettingsModalOpen,
    toggleSettingsModal,
    confirmConfig,
    categoryInitialParentId,
    editingSeriesId,
    setEditingSeriesId,
    selectedImageId,
    setSelectedImageId,
  } = useUIStore();

  const {
    series,
    categories,
    setActiveSeriesId,
    updateSeries,
    addSeries,
    updateCategory,
    deleteCategory,
    addCategory,
  } = useSeriesStore();

  const { settings, updateSettings } = useSettingsStore();
  const { close: closeConfirmModal } = useConfirm();

  const [modalCompareMode, setModalCompareMode] =
    React.useState<ViewMode>("slider");

  const activeSeries = series.find(
    (s) =>
      s.id ===
      (series.find((s) => s.images.some((i) => i.id === selectedImageId))?.id ||
        ""),
  );
  const selectedImg = selectedImageId
    ? series.flatMap((s) => s.images).find((i) => i.id === selectedImageId)
    : null;

  const handleConfirmSeries = useCallback(
    (
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
          categoryId: categoryId,
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
    },
    [
      editingSeriesId,
      updateSeries,
      addSeries,
      toggleNewSeriesModal,
      setEditingSeriesId,
    ],
  );

  const handleDeleteCategory = useCallback((id: string) => {
    // Logic moved here if needed, but for now we rely on the implementation in Manager
  }, []);

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

      <CategoryManagerModal
        isOpen={isCategoryModalOpen}
        onClose={() => toggleCategoryModal(false)}
        categories={categories}
        onUpdateCategory={updateCategory}
        onDeleteCategory={(id) => {
          const c = categories.find((item) => item.id === id);
          // We need a confirm here but confirmed already in Manager?
          // Let's assume Confirm handles it or Manager calls it.
          deleteCategory(id);
        }}
        onAddCategory={addCategory}
        initialParentId={categoryInitialParentId || undefined}
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
        onSettingsChange={updateSettings}
      />

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
    </>
  );
};

export default React.memo(GlobalModals);
