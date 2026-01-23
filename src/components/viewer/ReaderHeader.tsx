import React from "react";
import { Series } from "../../types";

interface ReaderHeaderProps {
  activeSeries: Series | undefined;
  currentImageIndex: number;
  imageCount: number;
  toggleViewOnly: () => void;
  setCurrentImageIndex: (index: number) => void;
  comparisonMode: string;
  setComparisonMode: (
    mode: "grid" | "slider" | "side-by-side" | "toggle",
  ) => void;
  children?: React.ReactNode;
}

const ReaderHeader: React.FC<ReaderHeaderProps> = ({
  activeSeries,
  currentImageIndex,
  imageCount,
  toggleViewOnly,
  setCurrentImageIndex,
  comparisonMode,
  setComparisonMode,
  children,
}) => {
  return (
    <div className="bg-surface/40 backdrop-blur-xl p-3 sm:p-6 rounded-2xl sm:rounded-[3rem] border border-border-muted flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6 mb-4 sm:mb-8 shadow-premium shrink-0 mx-2 sm:mx-6 mt-2 sm:mt-6 overflow-hidden relative glass-card">
      <div className="absolute top-0 left-0 w-32 h-full bg-primary/5 blur-3xl rounded-full -translate-x-1/2 pointer-events-none" />

      <div className="flex items-center justify-between w-full sm:justify-start sm:gap-6 z-10">
        <div className="flex flex-col min-w-0 pl-16 sm:pl-0">
          <h2 className="text-sm sm:text-2xl font-black text-text-main italic uppercase tracking-tight truncate max-w-[150px] sm:max-w-none text-glow">
            {activeSeries?.name}
          </h2>
          <div className="flex items-center gap-2 sm:gap-3 mt-1 sm:mt-0">
            <span className="text-[8px] sm:text-[10px] font-black text-primary uppercase tracking-widest bg-primary/10 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full border border-primary/20 shadow-glow">
              {activeSeries?.category}
            </span>
            <span className="text-[8px] sm:text-[10px] font-black text-text-dark uppercase tracking-widest">
              Page {currentImageIndex + 1} / {imageCount}
            </span>
          </div>
        </div>

        <button
          onClick={toggleViewOnly}
          className="group flex items-center gap-2.5 bg-surface-raised/50 hover:bg-red-500/10 text-text-muted hover:text-red-400 px-3 sm:px-5 py-2.5 sm:py-3.5 rounded-xl sm:rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all border border-border-muted hover:border-red-500/20 shadow-premium ml-auto sm:ml-0"
          title="Exit Reader"
        >
          <i className="fas fa-arrow-left group-hover:-translate-x-1 transition-transform"></i>
          <span className="hidden sm:inline">Back</span>
        </button>
      </div>

      <div className="flex items-center justify-between md:justify-end gap-3 sm:gap-4 z-10">
        <div className="hidden sm:flex items-center bg-surface-raised/50 rounded-2xl p-1.5 border border-border-muted glass">
          <button
            onClick={() => setCurrentImageIndex(0)}
            disabled={currentImageIndex === 0}
            className="p-2 sm:p-2.5 hover:bg-surface-elevated rounded-xl disabled:opacity-30 transition-all text-text-muted hover:text-text-main"
            title="First Page"
          >
            <i className="fas fa-step-backward text-[10px] sm:text-xs"></i>
          </button>
          <button
            onClick={() => setCurrentImageIndex(imageCount - 1)}
            disabled={currentImageIndex === imageCount - 1}
            className="p-2 sm:p-2.5 hover:bg-surface-elevated rounded-xl disabled:opacity-30 transition-all text-text-muted hover:text-text-main"
            title="Last Page"
          >
            <i className="fas fa-step-forward text-[10px] sm:text-xs"></i>
          </button>
        </div>

        <div className="flex items-center bg-surface-raised/50 rounded-2xl p-1.5 border border-border-muted glass gap-1.5">
          <button
            onClick={() => setComparisonMode("grid")}
            className={`p-2 sm:p-2.5 rounded-xl transition-all ${
              comparisonMode === "grid"
                ? "bg-primary text-white shadow-glow"
                : "text-text-muted hover:text-text-main hover:bg-surface-elevated"
            }`}
            title="Grid View"
          >
            <i className="fas fa-th text-[10px] sm:text-xs"></i>
          </button>
          <button
            onClick={() => setComparisonMode("slider")}
            className={`p-2 sm:p-2.5 rounded-xl transition-all ${
              comparisonMode !== "grid"
                ? "bg-primary text-white shadow-glow"
                : "text-text-muted hover:text-text-main hover:bg-surface-elevated"
            }`}
            title="Single View"
          >
            <i className="fas fa-image text-[10px] sm:text-xs"></i>
          </button>
        </div>

        {children}
      </div>
    </div>
  );
};

export default React.memo(ReaderHeader);
