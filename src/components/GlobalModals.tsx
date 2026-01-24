import React, { useCallback } from "react";
import { useConfirm } from "../hooks/useConfirm";
import { useSettingsStore } from "../stores/useSettingsStore";
import { useUIStore } from "../stores/useUIStore";
import { SeriesInput, ViewMode } from "../types";
import CategoryManagerModal from "./CategoryManagerModal";
import ComparisonView from "./ComparisonView";
import ConfirmModal from "./ConfirmModal";
import NewSeriesModal from "./NewSeriesModal";
import SettingsModal from "./SettingsModal";

import {
  useCategoriesQuery,
  useCreateCategoryMutation,
  useDeleteCategoryMutation,
  useUpdateCategoryMutation,
} from "../hooks/useCategoryQueries";
import {
  useCreateSeriesMutation,
  useSeriesQuery,
  useUpdateSeriesMutation,
} from "../hooks/useSeriesQueries";

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
    selectedImage,
    setSelectedImage,
  } = useUIStore();

  const { data: seriesListData } = useSeriesQuery();
  const { data: categoriesData } = useCategoriesQuery();

  const seriesItems = seriesListData?.items || [];
  const categories = categoriesData || [];

  const { mutate: createSeries } = useCreateSeriesMutation();
  const { mutate: updateSeries } = useUpdateSeriesMutation();
  const { mutate: addCategory } = useCreateCategoryMutation();
  const { mutate: updateCategory } = useUpdateCategoryMutation();
  const { mutate: deleteCategory } = useDeleteCategoryMutation();

  const { settings, updateSettings } = useSettingsStore();
  const { close: closeConfirmModal } = useConfirm();

  const [modalCompareMode, setModalCompareMode] =
    React.useState<ViewMode>("slider");

  const handleConfirmSeries = useCallback(
    (
      name: string,
      _categoryName: string,
      sequenceNumber: number,
      categoryId?: string,
      metadata?: { author?: string; group?: string; originalTitle?: string },
    ) => {
      const seriesInput: SeriesInput = {
        name,
        description: "",
        categoryId: categoryId,
        tags: [],
        sequenceNumber,
        author: metadata?.author,
        groupName: metadata?.group,
        originalTitle: metadata?.originalTitle,
      };

      if (editingSeriesId) {
        updateSeries({
          id: editingSeriesId,
          updates: seriesInput,
        });
        setEditingSeriesId(null);
      } else {
        createSeries(seriesInput);
      }
      toggleNewSeriesModal(false);
    },
    [
      editingSeriesId,
      updateSeries,
      createSeries,
      toggleNewSeriesModal,
      setEditingSeriesId,
    ],
  );

  const handleDeleteCategory = useCallback(
    (id: string) => {
      deleteCategory(id);
    },
    [deleteCategory],
  );

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
        onUpdateCategory={(id, name, pId, color) =>
          updateCategory({ id, name, parentId: pId, color })
        }
        onDeleteCategory={handleDeleteCategory}
        onAddCategory={(name, pId, color) =>
          addCategory({ name, parentId: pId, color })
        }
        initialParentId={categoryInitialParentId || undefined}
      />

      <NewSeriesModal
        isOpen={isNewSeriesModalOpen}
        onClose={() => {
          toggleNewSeriesModal(false);
          setEditingSeriesId(null);
        }}
        onConfirm={handleConfirmSeries}
        existingTitles={seriesItems.map((s) => s.name)}
        categories={categories}
        onAddCategory={(name) => addCategory({ name })}
        initialName={
          editingSeriesId
            ? seriesItems.find((s) => s.id === editingSeriesId)?.name
            : ""
        }
        initialCategory={
          editingSeriesId
            ? seriesItems.find((s) => s.id === editingSeriesId)?.category
            : ""
        }
        initialSequenceNumber={
          editingSeriesId
            ? seriesItems.find((s) => s.id === editingSeriesId)?.sequenceNumber
            : 0
        }
        initialAuthor={
          editingSeriesId
            ? seriesItems.find((s) => s.id === editingSeriesId)?.author
            : ""
        }
        initialGroup={
          editingSeriesId
            ? seriesItems.find((s) => s.id === editingSeriesId)?.group
            : ""
        }
        initialOriginalTitle={
          editingSeriesId
            ? seriesItems.find((s) => s.id === editingSeriesId)?.originalTitle
            : ""
        }
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => toggleSettingsModal(false)}
        settings={settings}
        onSettingsChange={updateSettings}
      />

      {selectedImage && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-sm flex flex-col items-center justify-center p-4 md:p-10"
          onClick={() => setSelectedImage(null)}
        >
          <div
            className="w-full max-w-5xl h-full flex flex-col items-center justify-center gap-6 animate-in zoom-in-95 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            {selectedImage.translatedUrl && (
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
                  id: selectedImage.id,
                  title: selectedImage.fileName,
                  sourceUrl: selectedImage.originalUrl,
                  convertedUrl:
                    selectedImage.translatedUrl || selectedImage.originalUrl,
                  createdAt: 0,
                }}
                mode={modalCompareMode}
              />
            </div>

            <button
              className="absolute top-8 right-8 text-white/50 hover:text-white text-3xl transition-colors"
              onClick={() => setSelectedImage(null)}
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
