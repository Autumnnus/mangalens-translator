import React from "react";
import { useConfirm } from "../../hooks/useConfirm";
import { useImageProcessor } from "../../hooks/useImageProcessor";
import { useImageUpload } from "../../hooks/useImageUpload";
import { useSeriesStore } from "../../stores/useSeriesStore";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { useUIStore } from "../../stores/useUIStore";
import ImageCard from "./ImageCard";

const EditorWorkspace: React.FC = () => {
  const { series, activeSeriesId, setImages } = useSeriesStore();
  const [viewMode, setViewMode] = React.useState<"grid" | "list" | "detail">(
    () => {
      if (typeof window !== "undefined") {
        const saved = localStorage.getItem("mangalens_editor_viewmode");
        if (saved === "grid" || saved === "list" || saved === "detail")
          return saved;
      }
      return "grid";
    },
  );

  React.useEffect(() => {
    localStorage.setItem("mangalens_editor_viewmode", viewMode);
  }, [viewMode]);

  const {
    toggleCategoryModal,
    toggleSettingsModal,
    toggleNewSeriesModal,
    setSelectedImageId,
  } = useUIStore();
  const { confirm } = useConfirm();
  const { isViewOnly, toggleViewOnly } = useSettingsStore();
  const { handleFileUpload } = useImageUpload();

  const { processAll, isProcessingAll } = useImageProcessor();

  const activeSeries = series.find((s) => s.id === activeSeriesId);
  const images = React.useMemo(
    () => activeSeries?.images || [],
    [activeSeries],
  );

  const totalStats = React.useMemo(() => {
    return images.reduce(
      (acc, img) => ({
        tokens: acc.tokens + (img.usage?.totalTokenCount || 0),
        cost: acc.cost + (img.cost || 0),
      }),
      { tokens: 0, cost: 0 },
    );
  }, [images]);

  // Pagination for Editor
  const [editorPage, setEditorPage] = React.useState(1);
  const editorPageSize = 20;
  const totalEditorPages = Math.ceil(images.length / editorPageSize);

  const paginatedImages = React.useMemo(() => {
    const start = (editorPage - 1) * editorPageSize;
    return images.slice(start, start + editorPageSize);
  }, [images, editorPage]);

  // Reset page when series changes
  React.useEffect(() => {
    setEditorPage(1);
  }, [activeSeriesId]);

  const clearAll = () => {
    confirm({
      title: "Wipe Series",
      message: "This will remove ALL images from this series. Are you sure?",
      onConfirm: () => {
        images.forEach((img) => {
          if (img.originalUrl.startsWith("blob:"))
            URL.revokeObjectURL(img.originalUrl);
        });
        if (activeSeriesId) {
          setImages(activeSeriesId, []);
        }
      },
      type: "danger",
    });
  };

  return (
    <main className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6 md:p-10">
      {!activeSeries ? (
        <div className="flex flex-col items-center justify-center h-[65vh] rounded-[3rem] border-2 border-dashed border-border-muted bg-surface/30 group transition-all duration-700 hover:border-primary/40 glass">
          <div className="mb-10 relative">
            <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full group-hover:bg-primary/30 transition-all duration-700"></div>
            <i className="fas fa-layer-group text-7xl text-text-dark group-hover:text-primary group-hover:scale-110 transition-all duration-500 relative z-10"></i>
          </div>
          <h2 className="text-3xl font-black text-text-dark uppercase tracking-tighter mb-4 group-hover:text-text-muted transition-colors">
            No Series Selected
          </h2>
          <p className="text-text-dark font-medium mb-8 max-w-md text-center leading-relaxed">
            Select a series from the sidebar or create a new one to start
            translating your manga.
          </p>
          <button
            onClick={() => toggleNewSeriesModal(true)}
            className="bg-primary text-white px-10 py-5 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-primary-hover hover:scale-105 active:scale-95 transition-all shadow-xl shadow-primary/20 border border-primary/50"
          >
            Create New Series
          </button>
        </div>
      ) : images.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[65vh] rounded-[3rem] border-2 border-dashed border-border-muted bg-surface/30 group transition-all duration-700 hover:border-primary/40 glass">
          <div className="mb-10 relative">
            <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full group-hover:bg-primary/30 transition-all duration-700"></div>
            <i className="fas fa-cloud-upload-alt text-7xl text-text-dark group-hover:text-primary group-hover:scale-110 transition-all duration-500 relative z-10"></i>
          </div>
          <div className="text-center">
            <h2 className="text-3xl font-black text-text-dark uppercase tracking-tighter mb-1 group-hover:text-text-muted transition-colors">
              Add Pages to
            </h2>
            <div className="text-primary font-black italic text-xl uppercase tracking-tighter mb-4 text-glow">
              {activeSeries.name}
            </div>
          </div>
          <p className="text-text-dark font-medium mb-8 max-w-md text-center leading-relaxed">
            Drag and drop your manga pages here or use the button below to add
            them to this series.
          </p>
          <label className="cursor-pointer bg-surface-raised text-white px-10 py-5 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-primary hover:scale-105 active:scale-95 transition-all shadow-xl shadow-black/20 group-hover:shadow-primary/30 border border-border-muted group-hover:border-primary/50">
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
                <p className="text-text-dark font-bold text-xs sm:text-sm tracking-wide flex flex-wrap gap-x-4 gap-y-1">
                  <span>
                    Working on{" "}
                    <span className="text-text-main font-black italic underline decoration-primary/50 underline-offset-4">
                      {activeSeries?.name}
                    </span>
                  </span>
                  {activeSeries?.author && (
                    <span className="flex items-center gap-1.5 flex-nowrap">
                      <span className="text-[10px] text-text-dark/60 uppercase tracking-tighter">
                        By
                      </span>
                      <span className="text-text-muted font-black italic">
                        {activeSeries.author}
                      </span>
                    </span>
                  )}
                  {activeSeries?.group && (
                    <span className="flex items-center gap-1.5 flex-nowrap">
                      <span className="text-[10px] text-text-dark/60 uppercase tracking-tighter">
                        Group
                      </span>
                      <span className="text-text-muted font-black italic">
                        {activeSeries.group}
                      </span>
                    </span>
                  )}
                  {activeSeries?.originalTitle && (
                    <span className="flex items-center gap-1.5 flex-nowrap">
                      <span className="text-[10px] text-text-dark/60 uppercase tracking-tighter">
                        Original
                      </span>
                      <span className="text-text-muted font-black italic">
                        {activeSeries.originalTitle}
                      </span>
                    </span>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-3">
                {/* Stats Pills */}
                <div className="flex items-center gap-1.5 px-3 py-1 bg-surface-raised/50 rounded-lg border border-border-muted shadow-sm">
                  <span className="text-[9px] font-bold text-text-dark uppercase tracking-widest">
                    Cost
                  </span>
                  <span className="text-xs font-black text-emerald-400 font-mono">
                    ${totalStats.cost.toFixed(4)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1 bg-surface-raised/50 rounded-lg border border-border-muted shadow-sm">
                  <span className="text-[9px] font-bold text-text-dark uppercase tracking-widest">
                    Tokens
                  </span>
                  <span className="text-xs font-black text-primary font-mono">
                    {totalStats.tokens.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1 bg-surface-raised/50 rounded-lg border border-border-muted shadow-sm">
                  <span className="text-[9px] font-bold text-text-dark uppercase tracking-widest">
                    Items
                  </span>
                  <span className="text-xs font-black text-text-muted font-mono">
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
                  className="bg-surface-raised hover:bg-surface-elevated text-text-muted hover:text-text-main px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-wider flex items-center gap-2 transition-all border border-border-muted"
                >
                  <i className="fas fa-book-open"></i> Preview
                </button>
                <button
                  onClick={() => toggleCategoryModal(true)}
                  className="bg-surface-raised hover:bg-surface-elevated text-text-muted hover:text-text-main px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-wider flex items-center gap-2 transition-all border border-border-muted"
                >
                  <i className="fas fa-tags"></i> Categories
                </button>
                <button
                  onClick={() => toggleSettingsModal(true)}
                  className="bg-surface-raised hover:bg-surface-elevated text-text-muted hover:text-text-main px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-wider flex items-center gap-2 transition-all border border-border-muted"
                >
                  <i className="fas fa-sliders-h"></i> Settings
                </button>
                <button
                  onClick={processAll}
                  disabled={isProcessingAll || images.length === 0}
                  className="bg-primary hover:bg-primary-hover disabled:bg-surface-raised disabled:text-text-dark transition-all px-4 py-2 rounded-xl font-black flex items-center gap-2 shadow-lg shadow-primary/20 text-[10px] uppercase tracking-wider border border-primary/20"
                >
                  {isProcessingAll ? (
                    <i className="fas fa-circle-notch fa-spin"></i>
                  ) : (
                    <i className="fas fa-bolt"></i>
                  )}
                  {isProcessingAll ? "Translating..." : "Translate All"}
                </button>
                <div className="flex bg-surface-raised/50 rounded-xl p-1 border border-border-subtle">
                  <button
                    onClick={() => setViewMode("grid")}
                    className={`p-2 rounded-lg transition-all ${
                      viewMode === "grid"
                        ? "bg-primary text-white shadow-glow"
                        : "text-text-dark hover:text-text-muted"
                    }`}
                  >
                    <i className="fas fa-th-large"></i>
                  </button>
                  <button
                    onClick={() => setViewMode("list")}
                    className={`p-2 rounded-lg transition-all ${
                      viewMode === "list"
                        ? "bg-primary text-white shadow-glow"
                        : "text-text-dark hover:text-text-muted"
                    }`}
                  >
                    <i className="fas fa-list"></i>
                  </button>
                  <button
                    onClick={() => setViewMode("detail")}
                    className={`p-2 rounded-lg transition-all ${
                      viewMode === "detail"
                        ? "bg-primary text-white shadow-glow"
                        : "text-text-dark hover:text-text-muted"
                    }`}
                  >
                    <i className="fas fa-square"></i>
                  </button>
                </div>
              </div>

              {/* File Ops */}
              {!isViewOnly && (
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
                  <button
                    onClick={clearAll}
                    className="text-slate-400 hover:text-red-400 text-[10px] uppercase font-bold flex items-center gap-1 transition-colors"
                  >
                    <i className="fas fa-trash"></i> Wipe All
                  </button>
                </div>
              )}
            </div>
          </div>

          <div
            className={`pb-12 ${
              viewMode === "grid"
                ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
                : viewMode === "list"
                  ? "space-y-2"
                  : "space-y-12 max-w-4xl mx-auto"
            }`}
          >
            {paginatedImages.map((image, idx) => {
              const globalIndex = (editorPage - 1) * editorPageSize + idx;
              return (
                <div
                  key={image.id}
                  onClick={
                    viewMode === "list"
                      ? () => setSelectedImageId(image.id)
                      : undefined
                  }
                  className={
                    viewMode === "list"
                      ? "bg-surface-raised/50 p-2 rounded-xl flex items-center gap-4 border border-border-subtle hover:border-primary/30 transition-all cursor-pointer group glass"
                      : ""
                  }
                >
                  {viewMode === "list" ? (
                    <>
                      <div className="w-12 h-16 bg-slate-900 rounded-md overflow-hidden shrink-0">
                        <img
                          src={image.originalUrl}
                          className="w-full h-full object-cover"
                          alt={image.fileName}
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
                    </>
                  ) : (
                    <ImageCard
                      image={image}
                      index={globalIndex}
                      total={images.length}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination Controls */}
          {totalEditorPages > 1 && (
            <div className="flex items-center justify-center gap-4 py-12 border-t border-slate-800/50 mt-12">
              <button
                disabled={editorPage === 1}
                onClick={() => {
                  setEditorPage(editorPage - 1);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="w-12 h-12 flex items-center justify-center bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-indigo-500/50 rounded-2xl transition-all disabled:opacity-30 shadow-xl"
              >
                <i className="fas fa-arrow-left"></i>
              </button>

              <div className="hidden sm:flex items-center gap-2">
                {Array.from({ length: totalEditorPages }, (_, i) => i + 1).map(
                  (p) => {
                    if (
                      p === 1 ||
                      p === totalEditorPages ||
                      Math.abs(p - editorPage) <= 2
                    ) {
                      return (
                        <button
                          key={p}
                          onClick={() => {
                            setEditorPage(p);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                          className={`w-12 h-12 rounded-2xl font-black text-xs transition-all border ${
                            editorPage === p
                              ? "bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/30"
                              : "bg-slate-900 border-slate-800 text-slate-500 hover:bg-slate-800 hover:text-white"
                          }`}
                        >
                          {p}
                        </button>
                      );
                    }
                    if (Math.abs(p - editorPage) === 3) {
                      return (
                        <span key={p} className="text-slate-700 font-bold px-1">
                          ...
                        </span>
                      );
                    }
                    return null;
                  },
                )}
              </div>

              <div className="sm:hidden text-xs font-black text-slate-500 uppercase tracking-widest">
                Page {editorPage} of {totalEditorPages}
              </div>

              <button
                disabled={editorPage === totalEditorPages}
                onClick={() => {
                  setEditorPage(editorPage + 1);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="w-12 h-12 flex items-center justify-center bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-indigo-500/50 rounded-2xl transition-all disabled:opacity-30 shadow-xl"
              >
                <i className="fas fa-arrow-right"></i>
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
};

export default EditorWorkspace;
