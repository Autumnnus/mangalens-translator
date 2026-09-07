import { Image as ImageIcon, PencilRuler } from "lucide-react";
import React, { useCallback } from "react";
import { useConfirm } from "../hooks/useConfirm";
import { useSeriesStore } from "../stores/useSeriesStore";
import { useSettingsStore } from "../stores/useSettingsStore";
import { useUIStore } from "../stores/useUIStore";
import { SeriesInput, ViewMode } from "../types";
import CategoryManagerModal from "./CategoryManagerModal";
import ConfirmModal from "./ConfirmModal";
import LayoutEditorModal from "./layout-editor/LayoutEditorModal";
import MigrationModal from "./MigrationModal";
import NewSeriesModal from "./NewSeriesModal";
import SettingsModal from "./SettingsModal";
import ToastViewport from "./ToastViewport";
import { Button, FullscreenShell, SegmentedControl } from "./ui";
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
    openLayoutEditor,
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
    React.useState<ViewMode>("toggle");

  const handleConfirmSeries = useCallback(
    async (
      name: string,
      _categoryName: string,
      categoryId?: string,
      metadata?: {
        author?: string;
        group?: string;
        originalTitle?: string;
        contentMode?: "standard" | "adult_verified";
      },
    ): Promise<void> => {
      const seriesInput: SeriesInput = {
        name,
        description: "",
        categoryId: categoryId,
        tags: [],
        author: metadata?.author,
        groupName: metadata?.group,
        originalTitle: metadata?.originalTitle,
        contentMode: metadata?.contentMode || "standard",
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

  const closeLightbox = useCallback(
    () => setSelectedImage(null),
    [setSelectedImage],
  );

  const handleOpenLayoutEditor = useCallback(() => {
    const current = images[selectedIndex] || selectedImage;
    if (current) openLayoutEditor(current);
  }, [images, selectedIndex, selectedImage, openLayoutEditor]);

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
        initialContentMode={
          editingSeriesId
            ? seriesItems.find((s) => s.id === editingSeriesId)?.contentMode
            : "standard"
        }
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => toggleSettingsModal(false)}
        settings={settings}
        onSettingsChange={updateSettings}
      />

      <MigrationModal />
      <LayoutEditorModal />

      {selectedImage && (
        <FullscreenShell
          open
          onClose={closeLightbox}
          theater
          layer="lightbox"
          icon={<ImageIcon />}
          title={selectedImage.fileName}
          subtitle={
            <span className="font-mono tabular">
              Page {selectedIndex + 1} of {images.length}
            </span>
          }
          actions={
            modalUIVisible ? (
              <>
                {selectedImage.translatedUrl && (
                  <SegmentedControl<ViewMode>
                    label="Compare mode"
                    size="sm"
                    value={modalCompareMode}
                    onChange={setModalCompareMode}
                    options={[
                      { value: "slider", label: "Slider" },
                      { value: "side-by-side", label: "Split" },
                      { value: "toggle", label: "Toggle" },
                    ]}
                  />
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<PencilRuler />}
                  onClick={handleOpenLayoutEditor}
                >
                  Open layout editor
                </Button>
              </>
            ) : null
          }
        >
          <div className="flex min-h-0 flex-1 flex-col">
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
        </FullscreenShell>
      )}
    </>
  );
};

export default React.memo(GlobalModals);
