import React from "react";
import { useImageUpload } from "../../hooks/useImageUpload";
import { useProjectImport } from "../../hooks/useProjectImport";
import { useSeriesStore } from "../../stores/useSeriesStore";
import { useUIStore } from "../../stores/useUIStore";
import ImageCard from "./ImageCard";

const EditorWorkspace: React.FC = () => {
  const { series, activeSeriesId, setImages } = useSeriesStore();
  const { openConfirmModal } = useUIStore();
  const { handleFileUpload } = useImageUpload();
  const { importLibrary } = useProjectImport();

  const activeSeries = series.find((s) => s.id === activeSeriesId);
  const images = activeSeries?.images || [];

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      importLibrary(file);
      e.target.value = "";
    }
  };

  const clearAll = () => {
    openConfirmModal({
      title: "Wipe Series",
      message: "This will remove ALL images from this series. Are you sure?",
      onConfirm: () => {
        images.forEach((img) => {
          if (img.originalUrl.startsWith("blob:"))
            URL.revokeObjectURL(img.originalUrl);
        });
        setImages(activeSeriesId, []);
      },
      type: "danger",
    });
  };

  return (
    <main className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6 md:p-10">
      {images.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[65vh] rounded-[4rem] border-4 border-dashed border-slate-800/50 bg-slate-900/10 group transition-all duration-700 hover:border-indigo-500/40">
          <div className="mb-10 relative">
            <div className="absolute inset-0 bg-indigo-500/20 blur-3xl rounded-full group-hover:bg-indigo-500/30 transition-all duration-700"></div>
            <i className="fas fa-cloud-upload-alt text-7xl text-slate-700 group-hover:text-indigo-400 group-hover:scale-110 transition-all duration-500 relative z-10"></i>
          </div>
          <h2 className="text-3xl font-black text-slate-700 uppercase tracking-tighter mb-4 group-hover:text-slate-500 transition-colors">
            Start Translating
          </h2>
          <p className="text-slate-500 font-medium mb-8 max-w-md text-center leading-relaxed">
            Drag and drop your manga pages here, or upload files to begin the
            magic.
          </p>
          <label className="cursor-pointer bg-slate-800 text-white px-10 py-5 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-indigo-600 hover:scale-105 active:scale-95 transition-all shadow-xl shadow-slate-900/20 group-hover:shadow-indigo-500/30 border border-slate-700 group-hover:border-indigo-500">
            <input
              type="file"
              multiple
              accept="image/*,.pdf"
              className="hidden"
              onChange={(e) => handleFileUpload(e.target.files)}
            />
            Upload Files
          </label>
        </div>
      ) : (
        <>
          <div className="flex flex-col md:flex-row justify-between md:items-end gap-6 mb-10 px-2 text-center md:text-left">
            <div>
              <h3 className="text-2xl sm:text-3xl font-black tracking-tighter uppercase mb-2">
                Editor Workspace
              </h3>
              <p className="text-slate-500 font-bold text-xs sm:text-sm tracking-wide">
                {images.length} items • Working on{" "}
                <span className="text-slate-300 font-black italic underline decoration-indigo-500/50 underline-offset-4">
                  {activeSeries?.name}
                </span>
              </p>
            </div>
            <div className="flex flex-wrap justify-center md:justify-end gap-3 sm:gap-4">
              <label className="cursor-pointer bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 px-4 sm:px-5 py-2.5 rounded-xl text-[10px] sm:text-xs font-black transition-all uppercase flex items-center gap-2 shrink-0">
                <input
                  type="file"
                  multiple
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={(e) => handleFileUpload(e.target.files)}
                />
                <i className="fas fa-plus-circle"></i> Append
              </label>
              <label className="cursor-pointer bg-amber-500/10 text-amber-500 hover:bg-amber-500 hover:text-white px-4 sm:px-5 py-2.5 rounded-xl text-[10px] sm:text-xs font-black transition-all border border-amber-500/20 uppercase flex items-center gap-2 shrink-0">
                <input
                  type="file"
                  accept=".zip"
                  className="hidden"
                  onChange={handleImport}
                />
                <i className="fas fa-file-import"></i> Import
              </label>
              <button
                onClick={clearAll}
                className="bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white px-4 sm:px-5 py-2.5 rounded-xl text-[10px] sm:text-xs font-black transition-all border border-red-500/20 uppercase shrink-0"
              >
                Wipe All
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-24">
            {images.map((image, index) => (
              <ImageCard
                key={image.id}
                image={image}
                index={index}
                total={images.length}
              />
            ))}
          </div>
        </>
      )}
    </main>
  );
};

export default EditorWorkspace;
