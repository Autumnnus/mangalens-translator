import React, { useState } from "react";
import { useSeriesStore } from "../../stores/useSeriesStore";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { useUIStore } from "../../stores/useUIStore";
import { ProcessedImage, ViewMode } from "../../types";
import ComparisonView from "../ComparisonView";
import ViewModeControls from "../ViewModeControls";

const ReaderView: React.FC = () => {
  const { series, activeSeriesId } = useSeriesStore();
  const { currentImageIndex, setCurrentImageIndex } = useUIStore();
  const { toggleViewOnly } = useSettingsStore();

  // Local state for reader-specific toggles
  const [showComparison, setShowComparison] = useState(false);
  const [comparisonMode, setComparisonMode] = useState<ViewMode>("slider");

  const activeSeries = React.useMemo(
    () => series.find((s) => s.id === activeSeriesId),
    [series, activeSeriesId],
  );
  const images = React.useMemo(
    () => activeSeries?.images || [],
    [activeSeries],
  );

  // Thumbnail Pagination State
  const thumbnailsPerPage = 20;
  const currentThumbPage = Math.floor(currentImageIndex / thumbnailsPerPage);

  const totalThumbPages = Math.ceil(images.length / thumbnailsPerPage);

  const currentThumbSet = React.useMemo(() => {
    const start = currentThumbPage * thumbnailsPerPage;
    return images.slice(start, start + thumbnailsPerPage);
  }, [images, currentThumbPage]);

  const currentImage = images[currentImageIndex];

  const handleNext = React.useCallback(() => {
    setCurrentImageIndex(Math.min(currentImageIndex + 1, images.length - 1));
  }, [currentImageIndex, images.length, setCurrentImageIndex]);

  const handlePrev = React.useCallback(() => {
    setCurrentImageIndex(Math.max(0, currentImageIndex - 1));
  }, [currentImageIndex, setCurrentImageIndex]);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") handleNext();
      if (e.key === "ArrowLeft") handlePrev();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleNext, handlePrev]);

  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe) handleNext();
    if (isRightSwipe) handlePrev();
  };

  if (images.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-10 opacity-50">
        <p>No images to view.</p>
      </div>
    );
  }

  const getPair = (img: ProcessedImage) => ({
    id: img.id,
    title: img.fileName,
    sourceUrl: img.originalUrl,
    convertedUrl: img.translatedUrl || img.originalUrl,
    createdAt: 0,
  });

  return (
    <div className="flex-1 flex flex-col h-full animate-in fade-in duration-700 min-h-0">
      <div className="bg-slate-900/40 backdrop-blur-xl p-2 sm:p-6 rounded-xl sm:rounded-[2.5rem] border border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-6 mb-2 sm:mb-8 shadow-2xl shrink-0 mx-2 sm:mx-4 mt-2 sm:mt-4 overflow-hidden relative">
        {/* Animated Background Accent */}
        <div className="absolute top-0 left-0 w-32 h-full bg-indigo-500/5 blur-3xl rounded-full -translate-x-1/2 pointer-events-none" />

        <div className="flex items-center justify-between w-full sm:justify-start sm:gap-6 z-10">
          <div className="flex flex-col min-w-0 pl-16 sm:pl-0">
            <h2 className="text-sm sm:text-2xl font-black text-white italic uppercase tracking-tight truncate max-w-[150px] sm:max-w-none">
              {activeSeries?.name}
            </h2>
            <div className="flex items-center gap-2 sm:gap-3 mt-1 sm:mt-0">
              <span className="text-[8px] sm:text-[10px] font-black text-indigo-400 uppercase tracking-widest bg-indigo-500/10 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full border border-indigo-500/20">
                {activeSeries?.category}
              </span>
              <span className="text-[8px] sm:text-[10px] font-black text-slate-500 uppercase tracking-widest">
                Page {currentImageIndex + 1} / {images.length}
              </span>
            </div>
          </div>

          <button
            onClick={toggleViewOnly}
            className="group flex items-center gap-2.5 bg-slate-950/50 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 px-3 sm:px-5 py-2 sm:py-3 rounded-xl sm:rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all border border-white/5 hover:border-rose-500/20 shadow-xl ml-auto sm:ml-0"
            title="Exit Reader"
          >
            <i className="fas fa-arrow-left group-hover:-translate-x-1 transition-transform"></i>
            <span className="hidden sm:inline">Back</span>
          </button>
        </div>

        <div className="flex items-center justify-between md:justify-end gap-2 sm:gap-3 z-10">
          {/* Quick Nav */}
          <div className="hidden sm:flex items-center bg-slate-800 rounded-lg p-1 border border-slate-700">
            <button
              onClick={() => setCurrentImageIndex(0)}
              disabled={currentImageIndex === 0}
              className="p-1.5 sm:p-2 hover:bg-slate-700 rounded-md disabled:opacity-30 transition-colors"
              title="First Page"
            >
              <i className="fas fa-step-backward text-[10px] sm:text-xs text-slate-400"></i>
            </button>
            <button
              onClick={() => setCurrentImageIndex(images.length - 1)}
              disabled={currentImageIndex === images.length - 1}
              className="p-1.5 sm:p-2 hover:bg-slate-700 rounded-md disabled:opacity-30 transition-colors"
              title="Last Page"
            >
              <i className="fas fa-step-forward text-[10px] sm:text-xs text-slate-400"></i>
            </button>
          </div>

          <div className="flex items-center bg-slate-800 rounded-lg p-1 border border-slate-700 gap-1">
            <button
              onClick={() => setComparisonMode("grid")}
              className={`p-1.5 sm:p-2 rounded-md transition-all ${
                comparisonMode === "grid"
                  ? "bg-indigo-600 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
              title="Grid View"
            >
              <i className="fas fa-th text-[10px] sm:text-xs"></i>
            </button>
            <button
              onClick={() => setComparisonMode("slider")}
              className={`p-1.5 sm:p-2 rounded-md transition-all ${
                comparisonMode !== "grid"
                  ? "bg-indigo-600 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
              title="Single View"
            >
              <i className="fas fa-image text-[10px] sm:text-xs"></i>
            </button>
          </div>

          {comparisonMode !== "grid" && (
            <ViewModeControls
              showComparison={showComparison}
              onToggleComparison={() => setShowComparison(!showComparison)}
              comparisonMode={comparisonMode}
              onChangeMode={setComparisonMode}
              hasTranslation={!!currentImage?.translatedUrl}
            />
          )}
        </div>
      </div>

      {/* Main Image Area */}
      {comparisonMode !== "grid" && (
        <div
          className="flex-1 min-h-0 flex items-center justify-center p-4 relative overflow-hidden touch-none"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {/* Navigation Click Zones */}
          <div
            className="absolute inset-y-0 left-0 w-1/4 z-30 cursor-pointer group/nav"
            onClick={(e) => {
              e.stopPropagation();
              handlePrev();
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-black/20 to-transparent opacity-0 group-hover/nav:opacity-100 transition-opacity flex items-center justify-start pl-8">
              <div className="w-12 h-12 rounded-full bg-slate-900/50 backdrop-blur-md flex items-center justify-center border border-white/10 text-white translate-x-[-10px] group-hover/nav:translate-x-0 transition-transform">
                <i className="fas fa-chevron-left"></i>
              </div>
            </div>
          </div>

          <div
            className="absolute inset-y-0 right-0 w-1/4 z-30 cursor-pointer group/nav"
            onClick={(e) => {
              e.stopPropagation();
              handleNext();
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-l from-black/20 to-transparent opacity-0 group-hover/nav:opacity-100 transition-opacity flex items-center justify-end pr-8">
              <div className="w-12 h-12 rounded-full bg-slate-900/50 backdrop-blur-md flex items-center justify-center border border-white/10 text-white translate-x-[10px] group-hover/nav:translate-x-0 transition-transform">
                <i className="fas fa-chevron-right"></i>
              </div>
            </div>
          </div>

          <div className="w-full h-full flex items-center justify-center relative z-10 transition-all duration-300">
            {showComparison && currentImage.translatedUrl ? (
              <div className="w-full h-full max-w-5xl mx-auto">
                <ComparisonView
                  pair={getPair(currentImage)}
                  mode={comparisonMode}
                />
              </div>
            ) : (
              <img
                src={currentImage?.translatedUrl || currentImage?.originalUrl}
                className="max-w-full max-h-full object-contain drop-shadow-2xl select-none"
                alt="Page"
                draggable={false}
              />
            )}
          </div>

          {/* Background Blur Effect */}
          <div className="absolute inset-0 z-0 opacity-20 pointer-events-none">
            <img
              src={currentImage?.translatedUrl || currentImage?.originalUrl}
              alt=""
              className="w-full h-full object-cover blur-3xl scale-110"
            />
          </div>
        </div>
      )}

      {/* Thumbnail Strip with Pagination */}
      <div
        className={`mt-4 sm:mt-8 p-4 bg-slate-900/40 backdrop-blur-xl rounded-[2rem] border border-white/5 mx-2 sm:mx-4 mb-4 shrink-0 transition-all ${
          comparisonMode === "grid" ? "overflow-y-auto max-h-[60vh]" : ""
        }`}
      >
        {/* Pagination Info & Controls */}
        <div className="flex items-center justify-between mb-4 px-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20">
              Batch {currentThumbPage + 1} / {totalThumbPages}
            </span>
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest hidden sm:inline">
              Showing {currentThumbPage * thumbnailsPerPage + 1} -{" "}
              {Math.min(
                (currentThumbPage + 1) * thumbnailsPerPage,
                images.length,
              )}{" "}
              of {images.length}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() =>
                setCurrentImageIndex(
                  Math.max(0, currentImageIndex - thumbnailsPerPage),
                )
              }
              disabled={currentThumbPage === 0}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl disabled:opacity-30 transition-all"
              title="Previous 20"
            >
              <i className="fas fa-angles-left text-xs"></i>
            </button>
            <button
              onClick={() =>
                setCurrentImageIndex(
                  Math.min(
                    images.length - 1,
                    currentImageIndex + thumbnailsPerPage,
                  ),
                )
              }
              disabled={currentThumbPage >= totalThumbPages - 1}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl disabled:opacity-30 transition-all"
              title="Next 20"
            >
              <i className="fas fa-angles-right text-xs"></i>
            </button>
          </div>
        </div>

        {comparisonMode === "grid" ? (
          <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-10 gap-4">
            {currentThumbSet.map((img) => {
              const idx = images.findIndex((i) => i.id === img.id);
              return (
                <button
                  key={img.id}
                  onClick={() => {
                    setCurrentImageIndex(idx);
                    setComparisonMode("slider");
                  }}
                  className={`relative aspect-[2/3] group rounded-xl overflow-hidden border-2 transition-all ${
                    idx === currentImageIndex
                      ? "border-indigo-500 shadow-xl scale-105 z-10"
                      : "border-slate-800 hover:border-indigo-400 opacity-70 hover:opacity-100"
                  }`}
                >
                  <img
                    src={img.originalUrl}
                    alt={`Page ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-white font-bold text-xs uppercase">
                      Pg {idx + 1}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center justify-start sm:justify-center gap-2 sm:gap-4 overflow-x-auto no-scrollbar pb-2">
            {currentThumbSet.map((img) => {
              const idx = images.findIndex((i) => i.id === img.id);
              return (
                <button
                  key={img.id}
                  onClick={() => setCurrentImageIndex(idx)}
                  className={`relative w-12 h-16 sm:w-20 sm:h-32 shrink-0 rounded-xl overflow-hidden border-2 transition-all ${
                    idx === currentImageIndex
                      ? "border-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.5)] scale-110 z-10"
                      : "border-slate-800 opacity-40 hover:opacity-100 hover:scale-105"
                  }`}
                >
                  <img
                    src={img.originalUrl}
                    alt={`Page ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-0 inset-x-0 bg-black/60 py-1">
                    <span className="text-[8px] font-black text-white uppercase tracking-tighter">
                      {idx + 1}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ReaderView;
