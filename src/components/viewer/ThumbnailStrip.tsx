import React from "react";
import { ProcessedImage } from "../../types";

interface ThumbnailStripProps {
  images: ProcessedImage[];
  currentThumbSet: ProcessedImage[];
  currentImageIndex: number;
  currentThumbPage: number;
  totalThumbPages: number;
  comparisonMode: string;
  onSelectIndex: (index: number) => void;
  onPagePrev: () => void;
  onPageNext: () => void;
  isOverlay?: boolean;
}

const ThumbnailStrip: React.FC<ThumbnailStripProps> = ({
  images,
  currentThumbSet,
  currentImageIndex,
  currentThumbPage,
  totalThumbPages,
  comparisonMode,
  onSelectIndex,
  onPagePrev,
  onPageNext,
  isOverlay = false,
}) => {
  return (
    <div
      className={`${isOverlay ? "p-2 sm:p-5 mx-0 sm:mx-6 mb-0 sm:mb-6 rounded-none sm:rounded-[3rem] border-x-0 sm:border-x" : "mt-3 sm:mt-10 p-3 sm:p-5 mx-2 sm:mx-6 mb-4 sm:mb-6 rounded-3xl border"} bg-surface/30 backdrop-blur-2xl border-border-muted shrink-0 transition-all glass-card ${
        comparisonMode === "grid"
          ? "overflow-y-auto max-h-[72vh] sm:max-h-[60vh] custom-scrollbar"
          : ""
      }`}
    >
      <div className="flex items-center justify-between mb-2 sm:mb-4 px-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black text-primary uppercase tracking-widest bg-primary/10 px-3 py-1 rounded-full border border-primary/20">
            {currentThumbPage + 1}/{totalThumbPages}
          </span>
          {!isOverlay && (
            <span className="text-[9px] font-black text-text-dark uppercase tracking-widest hidden sm:inline ml-2">
              {images.length} Pages
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={onPagePrev}
            disabled={currentThumbPage === 0}
            className="w-8 h-8 sm:w-10 sm:h-10 bg-surface-raised hover:bg-surface-elevated text-text-muted hover:text-text-main rounded-xl disabled:opacity-30 transition-all border border-border-muted flex items-center justify-center active:scale-95"
          >
            <i className="fas fa-chevron-left text-[10px]"></i>
          </button>
          <button
            onClick={onPageNext}
            disabled={currentThumbPage >= totalThumbPages - 1}
            className="w-8 h-8 sm:w-10 sm:h-10 bg-surface-raised hover:bg-surface-elevated text-text-muted hover:text-text-main rounded-xl disabled:opacity-30 transition-all border border-border-muted flex items-center justify-center active:scale-95"
          >
            <i className="fas fa-chevron-right text-[10px]"></i>
          </button>
        </div>
      </div>

      {comparisonMode === "grid" ? (
        <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-10 gap-2 sm:gap-4">
          {currentThumbSet.map((img) => {
            const idx = images.findIndex((i) => i.id === img.id);
            return (
              <button
                key={img.id}
                onClick={() => onSelectIndex(idx)}
                className={`relative aspect-[3/4] sm:aspect-[2/3] group rounded-xl sm:rounded-2xl overflow-hidden border-2 transition-all shadow-premium bg-black/80 ${
                  idx === currentImageIndex
                    ? "border-primary shadow-glow scale-105 z-10"
                    : "border-border-muted hover:border-primary/50 opacity-70 hover:opacity-100"
                }`}
              >
                <img
                  src={img.originalUrl}
                  alt={`Page ${idx + 1}`}
                  loading="lazy"
                  className="w-full h-full object-contain transition-opacity duration-300 p-1"
                  onLoad={(e) => (e.currentTarget.style.opacity = "1")}
                  style={{ opacity: 0 }}
                />
                <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
                  <span className="text-white font-black text-xs uppercase tracking-widest bg-primary/80 px-2 py-1 rounded-lg">
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
                onClick={() => onSelectIndex(idx)}
                className={`relative w-16 h-24 sm:w-24 sm:h-36 shrink-0 rounded-xl sm:rounded-2xl overflow-hidden border-2 transition-all shadow-premium bg-black/80 ${
                  idx === currentImageIndex
                    ? "border-primary shadow-glow scale-110 z-10"
                    : "border-border-muted opacity-40 hover:opacity-100 hover:scale-105"
                }`}
              >
                <img
                  src={img.originalUrl}
                  alt={`Page ${idx + 1}`}
                  loading="lazy"
                  className="w-full h-full object-contain transition-opacity duration-300 p-1"
                  onLoad={(e) => (e.currentTarget.style.opacity = "1")}
                  style={{ opacity: 0 }}
                />
                <div className="absolute bottom-0 inset-x-0 bg-surface/80 backdrop-blur-md py-1.5 border-t border-border-muted">
                  <span className="text-[10px] font-black text-text-main uppercase tracking-tighter">
                    {idx + 1}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default React.memo(ThumbnailStrip);
