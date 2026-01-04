import React from "react";
import { useImageProcessor } from "../../hooks/useImageProcessor";
import { useImageUpload } from "../../hooks/useImageUpload";
import { useProjectExport } from "../../hooks/useProjectExport";
import { useProjectImport } from "../../hooks/useProjectImport";
import { useSeriesStore } from "../../stores/useSeriesStore";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { useUIStore } from "../../stores/useUIStore";
import ImageCard from "./ImageCard";

const EditorWorkspace: React.FC = () => {
  const { series, activeSeriesId, setImages } = useSeriesStore();
  const { openConfirmModal, toggleCategoryModal, toggleSettingsModal } =
    useUIStore();
  const { isViewOnly, toggleViewOnly } = useSettingsStore();
  const { handleFileUpload } = useImageUpload();
  const { importLibrary } = useProjectImport();
  const [viewMode, setViewMode] = React.useState<"grid" | "list" | "detail">(
    "grid"
  );
  const { processAll, isProcessingAll } = useImageProcessor();
  const { downloadAllAsZip } = useProjectExport();

  const activeSeries = series.find((s) => s.id === activeSeriesId);
  const images = activeSeries?.images || [];

  const totalStats = React.useMemo(() => {
    return images.reduce(
      (acc, img) => ({
        tokens: acc.tokens + (img.usage?.totalTokenCount || 0),
        cost: acc.cost + (img.cost || 0),
      }),
      { tokens: 0, cost: 0 }
    );
  }, [images]);

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
          {/* Empty State (unchanged) */}
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
          {/* Editor Header / Stats Bar */}
          <div className="flex flex-col xl:flex-row justify-between xl:items-end gap-6 mb-8 px-2">
            <div className="space-y-4">
              <div>
                <h3 className="text-2xl sm:text-3xl font-black tracking-tighter uppercase mb-2">
                  Editor Workspace
                </h3>
                <p className="text-slate-500 font-bold text-xs sm:text-sm tracking-wide">
                  Working on{" "}
                  <span className="text-slate-300 font-black italic underline decoration-indigo-500/50 underline-offset-4">
                    {activeSeries?.name}
                  </span>
                </p>
              </div>

              <div className="flex items-center gap-3">
                {/* Stats Pills */}
                <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 rounded-lg border border-slate-700">
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                    Cost
                  </span>
                  <span className="text-xs font-black text-emerald-400 font-mono">
                    ${totalStats.cost.toFixed(4)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 rounded-lg border border-slate-700">
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                    Tokens
                  </span>
                  <span className="text-xs font-black text-indigo-400 font-mono">
                    {totalStats.tokens.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 rounded-lg border border-slate-700">
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                    Items
                  </span>
                  <span className="text-xs font-black text-slate-300 font-mono">
                    {images.length}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={toggleViewOnly}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-wider flex items-center gap-2 transition-all border border-slate-700"
                >
                  <i className="fas fa-book-open"></i> Preview
                </button>
                <button
                  onClick={() => toggleCategoryModal(true)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-wider flex items-center gap-2 transition-all border border-slate-700"
                >
                  <i className="fas fa-tags"></i> Categories
                </button>
                <button
                  onClick={() => toggleSettingsModal(true)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-wider flex items-center gap-2 transition-all border border-slate-700"
                >
                  <i className="fas fa-sliders-h"></i> Settings
                </button>
                <button
                  onClick={processAll}
                  disabled={isProcessingAll || images.length === 0}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 transition-all px-4 py-2 rounded-xl font-black flex items-center gap-2 shadow-lg shadow-indigo-500/20 text-[10px] uppercase tracking-wider"
                >
                  {isProcessingAll ? (
                    <i className="fas fa-circle-notch fa-spin"></i>
                  ) : (
                    <i className="fas fa-bolt"></i>
                  )}
                  {isProcessingAll ? "Translating..." : "Translate All"}
                </button>
                <button
                  onClick={downloadAllAsZip}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-wider flex items-center gap-2 transition-all border border-slate-700"
                >
                  <i className="fas fa-archive"></i> Download ZIP
                </button>

                {/* View Mode Toggles */}
                <div className="flex bg-slate-800 rounded-lg p-1 border border-slate-700">
                  <button
                    onClick={() => setViewMode("grid")}
                    className={`p-2 rounded-md ${
                      viewMode === "grid"
                        ? "bg-indigo-600 text-white"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    <i className="fas fa-th-large"></i>
                  </button>
                  <button
                    onClick={() => setViewMode("list")}
                    className={`p-2 rounded-md ${
                      viewMode === "list"
                        ? "bg-indigo-600 text-white"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    <i className="fas fa-list"></i>
                  </button>
                  <button
                    onClick={() => setViewMode("detail")}
                    className={`p-2 rounded-md ${
                      viewMode === "detail"
                        ? "bg-indigo-600 text-white"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    <i className="fas fa-square"></i>
                  </button>
                </div>
              </div>

              {/* File Ops */}
              <div className="flex flex-wrap items-center gap-3 justify-end">
                <label className="cursor-pointer text-slate-400 hover:text-green-400 text-[10px] uppercase font-bold flex items-center gap-1 transition-colors">
                  <input
                    type="file"
                    multiple
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={(e) => handleFileUpload(e.target.files)}
                  />
                  <i className="fas fa-plus"></i> Add pages
                </label>
                <label className="cursor-pointer text-slate-400 hover:text-amber-400 text-[10px] uppercase font-bold flex items-center gap-1 transition-colors">
                  <input
                    type="file"
                    accept=".zip"
                    className="hidden"
                    onChange={handleImport}
                  />
                  <i className="fas fa-file-import"></i> Import ZIP
                </label>
                <button
                  onClick={clearAll}
                  className="text-slate-400 hover:text-red-400 text-[10px] uppercase font-bold flex items-center gap-1 transition-colors"
                >
                  <i className="fas fa-trash"></i> Wipe All
                </button>
              </div>
            </div>
          </div>

          <div
            className={`pb-24 ${
              viewMode === "grid"
                ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
                : viewMode === "list"
                ? "space-y-2"
                : "space-y-12 max-w-4xl mx-auto"
            }`}
          >
            {images.map((image, index) => (
              <div
                key={image.id}
                className={
                  viewMode === "list"
                    ? "bg-slate-800/50 p-2 rounded-lg flex items-center gap-4 border border-slate-800 hover:border-indigo-500/30 transition-all"
                    : ""
                }
              >
                {viewMode === "list" ? (
                  <>
                    <div className="w-12 h-16 bg-slate-900 rounded-md overflow-hidden shrink-0">
                      <img
                        src={image.originalUrl}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-slate-500 text-[10px] font-mono">
                          #{image.sequenceNumber}
                        </span>
                        <h4
                          className="text-slate-200 font-bold text-xs truncate"
                          title={image.fileName}
                        >
                          {image.fileName}
                        </h4>
                      </div>
                      <div className="flex items-center gap-3">
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider ${
                            image.status === "completed"
                              ? "text-emerald-400"
                              : image.status === "processing"
                              ? "text-amber-400"
                              : "text-slate-500"
                          }`}
                        >
                          {image.status}
                        </span>
                        {image.cost && (
                          <span className="text-[10px] text-slate-500">
                            ${image.cost.toFixed(4)}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Reuse ImageCard logic? We might need a separate Row component, but for now just basic info. 
                                Actually, user might want to edit in list view too. 
                                Ideally ImageCard should support 'variant' prop. 
                                But for now, let's keep it simple or render ImageCard in different wrapper.
                                Wait, passing props to ImageCard is easier if it supported layout. 
                                Let's just use ImageCard for grid and detail, and simple row for list for now, or just render ImageCard.
                                Actually, ImageCard is quite complex (has actions). 
                                Let's stick to Grid being the main interactive one. List view is "summary".
                                But user asked for "frontend viewing".
                                "View Type" usually implies how the main cards look.
                                Let's try to just change the Grid CSS classes? 
                                Grid: grid-cols-4
                                List: grid-cols-1 (and maybe pass a prop to ImageCard to be wide?)
                                Detail: grid-cols-1 (but large)
                                
                                Let's use grid-cols-1 for list/detail.
                             */}
                  </>
                ) : (
                  <ImageCard
                    image={image}
                    index={index}
                    total={images.length}
                    // variant={viewMode} // Pass this if I update ImageCard, but for now standard card.
                    // If Detail mode, scale up?
                  />
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
};

export default EditorWorkspace;
