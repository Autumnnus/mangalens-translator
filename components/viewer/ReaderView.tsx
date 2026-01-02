import React, { useState } from "react";
import { useSeriesStore } from "../../stores/useSeriesStore";
import { useUIStore } from "../../stores/useUIStore";
import { ViewMode } from "../../types";
import ComparisonView from "../ComparisonView";
import ViewModeControls from "../ViewModeControls";

const ReaderView: React.FC = () => {
  const { series, activeSeriesId } = useSeriesStore();
  const { currentImageIndex, setCurrentImageIndex } = useUIStore();

  // Local state for reader-specific toggles
  const [showComparison, setShowComparison] = useState(false);
  const [comparisonMode, setComparisonMode] = useState<ViewMode>("slider");

  const activeSeries = series.find((s) => s.id === activeSeriesId);
  const images = activeSeries?.images || [];

  const currentImage = images[currentImageIndex];

  const handleNext = () => {
    if (currentImageIndex < images.length - 1) {
      setCurrentImageIndex(currentImageIndex + 1);
    }
  };

  const handlePrev = () => {
    if (currentImageIndex > 0) {
      setCurrentImageIndex(currentImageIndex - 1);
    }
  };

  if (images.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-10 opacity-50">
        <p>No images to view.</p>
      </div>
    );
  }

  // Helper for ComparisonView pair prop
  const getPair = (img: any) => ({
    id: img.id,
    title: img.fileName,
    sourceUrl: img.originalUrl,
    convertedUrl: img.translatedUrl || img.originalUrl,
    createdAt: 0, // Mock or ignore if not used strictly
  });

  return (
    <div className="flex-1 flex flex-col h-full animate-in fade-in duration-700 min-h-0">
      {/* Premium Viewer Header */}
      <div className="bg-slate-900/40 backdrop-blur-xl p-3 sm:p-6 rounded-2xl sm:rounded-[2.5rem] border border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6 mb-4 sm:mb-8 shadow-2xl shrink-0 mx-4 mt-4">
        <div className="flex flex-col">
          <h2 className="text-lg sm:text-2xl font-black text-white italic uppercase tracking-tight truncate max-w-[200px] sm:max-w-none">
            {activeSeries?.name}
          </h2>
          <div className="flex items-center gap-3 mt-1 sm:mt-0">
            <span className="text-[8px] sm:text-[10px] font-black text-indigo-400 uppercase tracking-widest bg-indigo-500/10 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full border border-indigo-500/20">
              {activeSeries?.category}
            </span>
            <span className="text-[8px] sm:text-[10px] font-black text-slate-500 uppercase tracking-widest">
              Page {currentImageIndex + 1} / {images.length}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between md:justify-end gap-3">
          <ViewModeControls
            showComparison={showComparison}
            onToggleComparison={() => setShowComparison(!showComparison)}
            comparisonMode={comparisonMode}
            onChangeMode={setComparisonMode}
          />

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={handlePrev}
              disabled={currentImageIndex === 0}
              className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-slate-800 text-slate-400 hover:bg-indigo-600 hover:text-white disabled:opacity-30 disabled:hover:bg-slate-800 transition-all flex items-center justify-center border border-slate-700 shadow-xl"
            >
              <i className="fas fa-chevron-left text-sm sm:text-lg"></i>
            </button>
            <button
              onClick={handleNext}
              disabled={currentImageIndex === images.length - 1}
              className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-500/30 disabled:opacity-30 transition-all flex items-center justify-center border border-indigo-500/30"
            >
              <i className="fas fa-chevron-right text-sm sm:text-lg"></i>
            </button>
          </div>
        </div>
      </div>

      {/* Main Image Area */}
      <div className="flex-1 min-h-0 flex items-center justify-center p-4 relative overflow-hidden">
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
              className="max-w-full max-h-full object-contain drop-shadow-2xl"
              alt="Page"
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

      {/* Thumbnail Strip */}
      <div className="mt-4 sm:mt-8 flex items-center justify-start sm:justify-center gap-2 sm:gap-3 p-2 sm:p-4 shrink-0 overflow-x-auto no-scrollbar max-w-full mx-auto">
        {images.map((img, idx) => (
          <button
            key={img.id}
            onClick={() => setCurrentImageIndex(idx)}
            className={`relative w-12 h-16 sm:w-16 sm:h-24 shrink-0 rounded-lg sm:rounded-xl overflow-hidden border-2 transition-all ${
              idx === currentImageIndex
                ? "border-indigo-500 shadow-lg shadow-indigo-500/50 scale-110 z-10"
                : "border-slate-700 opacity-50 hover:opacity-100 hover:scale-105"
            }`}
          >
            <img
              src={img.originalUrl}
              alt={`Page ${idx + 1}`}
              className="w-full h-full object-cover"
            />
          </button>
        ))}
      </div>
    </div>
  );
};

export default ReaderView;
