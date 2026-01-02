import React, { useEffect } from "react";
import CategoryManagerModal from "./components/CategoryManagerModal";
import ComparisonView from "./components/ComparisonView"; // For modal view
import ConfirmModal from "./components/ConfirmModal";
import NewSeriesModal from "./components/NewSeriesModal";
import SeriesSidebar from "./components/SeriesSidebar";
import SettingsModal from "./components/SettingsModal";
import EditorWorkspace from "./components/editor/EditorWorkspace";
import Header from "./components/layout/Header";
import ReaderView from "./components/viewer/ReaderView";

import { useProjectExport } from "./hooks/useProjectExport";
import { useProjectImport } from "./hooks/useProjectImport";
import { useSeriesStore } from "./stores/useSeriesStore";
import { useSettingsStore } from "./stores/useSettingsStore";
import { useUIStore } from "./stores/useUIStore";
import { ViewMode } from "./types";

const App: React.FC = () => {
  // Store Hooks
  const {
    series,
    activeSeriesId,
    categories,
    rehydrateImages,
    deleteSeries,
    setActiveSeriesId,
    setCategories,
    updateCategoryName,
    deleteCategory,
    addSeries,
    updateSeries,
  } = useSeriesStore();
  const { settings, updateSettings, isViewOnly } = useSettingsStore();
  const {
    isSidebarOpen,
    toggleSidebar,
    isCategoryModalOpen,
    toggleCategoryModal,
    isNewSeriesModalOpen,
    toggleNewSeriesModal,
    isSettingsModalOpen,
    toggleSettingsModal,
    confirmConfig,
    closeConfirmModal,
    editingSeriesId,
    setEditingSeriesId,
    selectedImageId,
    setSelectedImageId,
  } = useUIStore();

  const { downloadFullAccountZip } = useProjectExport();
  const { importLibrary } = useProjectImport();

  const activeSeries = series.find((s) => s.id === activeSeriesId) || series[0];
  const images = activeSeries?.images || [];

  // Mount effects
  useEffect(() => {
    rehydrateImages();
  }, []);

  // State Wrappers for Sidebar/Modals (Adapting store actions to component props)
  const handleSelectSeries = (id: string) => {
    setActiveSeriesId(id);
    toggleSidebar(false);
  };

  const handleEditSeries = (id: string) => {
    setEditingSeriesId(id);
    toggleNewSeriesModal(true);
  };

  const handleConfirmSeries = (name: string, category: string) => {
    if (editingSeriesId) {
      updateSeries(editingSeriesId, { name, category });
      setEditingSeriesId(null);
    } else {
      addSeries({
        id: Math.random().toString(36).substring(2, 9),
        name,
        description: "",
        category,
        tags: [],
        images: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
    toggleNewSeriesModal(false);
  };

  const selectedImg = selectedImageId
    ? images.find((i) => i.id === selectedImageId)
    : null;
  const [modalCompareMode, setModalCompareMode] =
    React.useState<ViewMode>("slider");

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

      <div className="flex h-screen bg-[#020617] text-slate-100 font-sans overflow-hidden">
        <SeriesSidebar
          series={series}
          activeId={activeSeriesId}
          onSelect={handleSelectSeries}
          onAdd={() => toggleNewSeriesModal(true)}
          onDelete={deleteSeries}
          onEdit={handleEditSeries}
          onExportAll={downloadFullAccountZip}
          isOpen={isSidebarOpen}
          onClose={() => toggleSidebar(false)}
          onImport={(e) => {
            // importLibrary expects File, but sidebar input event provides ChangeEvent
            const file = e.target.files?.[0];
            if (file) {
              importLibrary(file);
              e.target.value = "";
            }
          }}
          isViewOnly={isViewOnly}
          categories={categories}
        />

        <CategoryManagerModal
          isOpen={isCategoryModalOpen}
          onClose={() => toggleCategoryModal(false)}
          categories={categories}
          onUpdateCategory={updateCategoryName}
          onDeleteCategory={deleteCategory}
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
          onAddCategory={(cat) => setCategories([...categories, cat])} // This might be redundant if setCategories replaces all
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
        />

        <SettingsModal
          isOpen={isSettingsModalOpen}
          onClose={() => toggleSettingsModal(false)}
          settings={settings}
          onSettingsChange={(newSettings) => {
            updateSettings(newSettings);
          }}
        />

        {/* We need to pass the real update function to SettingsModal. 
            SettingsModal expects (settings: TranslationSettings) => void. 
            Our store update expects Partial.
            Adapter:
        */}
        {isSettingsModalOpen && (
          <div className="hidden">
            {/* Hack: The modal is rendered above but I need to fix the props passing in real code. 
                     The SettingsModal component is rendered unconditionally in previous App.tsx but controlled by isOpen prop.
                     I'll fix the prop underneath.
                 */}
          </div>
        )}

        <div className="flex-1 flex flex-col h-full overflow-x-hidden overflow-y-auto custom-scrollbar relative">
          <Header />

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
                  )
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
                  createdAt: Date.now(),
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

export default App;
