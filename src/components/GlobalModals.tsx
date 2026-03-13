import React, { useCallback } from "react";
import { useConfirm } from "../hooks/useConfirm";
import { useSeriesStore } from "../stores/useSeriesStore";
import { useSettingsStore } from "../stores/useSettingsStore";
import { useUIStore } from "../stores/useUIStore";
import { SeriesInput, ViewMode } from "../types";
import CategoryManagerModal from "./CategoryManagerModal";
import ConfirmModal from "./ConfirmModal";
import NewSeriesModal from "./NewSeriesModal";
import SettingsModal from "./SettingsModal";
import ToastViewport from "./ToastViewport";
import ReaderImageArea from "./viewer/ReaderImageArea";

import {
  useCategoriesQuery,
  useCreateCategoryMutation,
  useDeleteCategoryMutation,
  useUpdateCategoryMutation,
} from "../hooks/useCategoryQueries";
import {
  useCreateSeriesMutation,
  useSeriesImagesQuery,
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
    defaultCategoryId,
    setDefaultCategoryId,
    selectedImage,
    setSelectedImage,
  } = useUIStore();

  const activeSeriesId = useSeriesStore((state) => state.activeSeriesId);
  const { data: imagesData } = useSeriesImagesQuery(activeSeriesId);
  const images = React.useMemo(() => imagesData || [], [imagesData]);

  const [modalUIVisible, setModalUIVisible] = React.useState(true);

  const selectedIndex = React.useMemo(() => {
    if (!selectedImage || images.length === 0) return 0;
    const index = images.findIndex(
      (img: import("../types").ProcessedImage) => img.id === selectedImage.id,
    );
    return index === -1 ? 0 : index;
  }, [selectedImage, images]);

  const handleIndexChange = React.useCallback(
    (index: number) => {
      if (
        images[index] &&
        (!selectedImage || images[index].id !== selectedImage.id)
      ) {
        setSelectedImage(images[index]);
      }
    },
    [images, selectedImage, setSelectedImage],
  );

  const { data: seriesListData } = useSeriesQuery();
  const { data: categoriesData } = useCategoriesQuery();

  const seriesItems = seriesListData?.items || [];
  const categories = categoriesData || [];

  const { mutateAsync: createSeries } = useCreateSeriesMutation();
  const { mutate: updateSeries } = useUpdateSeriesMutation();
  const { mutate: addCategory } = useCreateCategoryMutation();
  const { mutate: updateCategory } = useUpdateCategoryMutation();
  const { mutate: deleteCategory } = useDeleteCategoryMutation();

  const setActiveSeriesId = useSeriesStore((state) => state.setActiveSeriesId);

  const { settings, updateSettings } = useSettingsStore();
  const { close: closeConfirmModal } = useConfirm();

  const [modalCompareMode, setModalCompareMode] =
    React.useState<ViewMode>("slider");

  const handleConfirmSeries = useCallback(
    async (
      name: string,
      _categoryName: string,
      categoryId?: string,
      metadata?: { author?: string; group?: string; originalTitle?: string },
    ): Promise<void> => {
      const seriesInput: SeriesInput = {
        name,
        description: "",
        categoryId: categoryId,
        tags: [],
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
        const newSeriesId = await createSeries(seriesInput);
        if (newSeriesId) {
          setActiveSeriesId(newSeriesId);
        }
      }
      toggleNewSeriesModal(false);
    },
    [
      editingSeriesId,
      updateSeries,
      createSeries,
      toggleNewSeriesModal,
      setEditingSeriesId,
      setActiveSeriesId,
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
      <ToastViewport />

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
          setDefaultCategoryId(null);
        }}
        onConfirm={handleConfirmSeries}
        existingTitles={seriesItems.map((s) => s.name)}
        categories={categories}
        onAddCategory={(name) => addCategory({ name })}
        initialCategoryId={defaultCategoryId || undefined}
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
            <div className="w-full h-full flex flex-col relative min-h-0">
              <div className="flex-1 min-h-0 relative">
                <ReaderImageArea
                  images={images}
                  currentIndex={selectedIndex}
                  onIndexChange={handleIndexChange}
                  showComparison={!!selectedImage.translatedUrl}
                  comparisonMode={modalCompareMode}
                  onToggleUI={() => setModalUIVisible(!modalUIVisible)}
                  isUIVisible={modalUIVisible}
                />
              </div>

              {selectedImage.translatedUrl && modalUIVisible && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[110] bg-slate-900/80 backdrop-blur-md p-1.5 rounded-2xl flex gap-1.5 border border-white/10 shadow-2xl">
                  {(["slider", "side-by-side", "toggle"] as ViewMode[]).map(
                    (mode) => (
                      <button
                        key={mode}
                        onClick={() => setModalCompareMode(mode)}
                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                          modalCompareMode === mode
                            ? "bg-primary text-white shadow-glow"
                            : "text-slate-400 hover:text-white hover:bg-white/5"
                        }`}
                      >
                        {mode.replace(/-/g, " ")}
                      </button>
                    ),
                  )}
                </div>
              )}
            </div>

            <button
              className={`absolute top-8 right-8 text-white/50 hover:text-white text-3xl transition-all z-[120] ${!modalUIVisible ? "opacity-0 pointer-events-none" : "opacity-100"}`}
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
