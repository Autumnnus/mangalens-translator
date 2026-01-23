import React from "react";
import { ProcessedImage, ViewMode } from "../../types";
import ComparisonView from "../ComparisonView";

interface ReaderImageAreaProps {
  currentImage: ProcessedImage;
  showComparison: boolean;
  comparisonMode: ViewMode;
  onNext: () => void;
  onPrev: () => void;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: () => void;
}

const ReaderImageArea: React.FC<ReaderImageAreaProps> = ({
  currentImage,
  showComparison,
  comparisonMode,
  onNext,
  onPrev,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
}) => {
  const getPair = (img: ProcessedImage) => ({
    id: img.id,
    title: img.fileName,
    sourceUrl: img.originalUrl,
    convertedUrl: img.translatedUrl || img.originalUrl,
    createdAt: 0,
  });

  return (
    <div
      className="flex-1 min-h-0 flex items-center justify-center p-4 relative overflow-hidden touch-none"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div
        className="absolute inset-y-0 left-0 w-1/4 z-30 cursor-pointer group/nav"
        onClick={(e) => {
          e.stopPropagation();
          onPrev();
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-background/40 to-transparent opacity-0 group-hover/nav:opacity-100 transition-opacity flex items-center justify-start pl-8">
          <div className="w-14 h-14 rounded-2xl bg-surface/60 backdrop-blur-xl flex items-center justify-center border border-border-muted text-text-main translate-x-[-10px] group-hover/nav:translate-x-0 transition-transform shadow-premium">
            <i className="fas fa-chevron-left text-lg"></i>
          </div>
        </div>
      </div>

      <div
        className="absolute inset-y-0 right-0 w-1/4 z-30 cursor-pointer group/nav"
        onClick={(e) => {
          e.stopPropagation();
          onNext();
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-l from-background/40 to-transparent opacity-0 group-hover/nav:opacity-100 transition-opacity flex items-center justify-end pr-8">
          <div className="w-14 h-14 rounded-2xl bg-surface/60 backdrop-blur-xl flex items-center justify-center border border-border-muted text-text-main translate-x-[10px] group-hover/nav:translate-x-0 transition-transform shadow-premium">
            <i className="fas fa-chevron-right text-lg"></i>
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
            className="max-w-full max-h-full object-contain shadow-glow-premium select-none rounded-xl"
            alt="Page"
            draggable={false}
          />
        )}
      </div>

      <div className="absolute inset-0 z-0 opacity-20 pointer-events-none">
        <img
          src={currentImage?.translatedUrl || currentImage?.originalUrl}
          alt=""
          className="w-full h-full object-cover blur-3xl scale-110"
        />
      </div>
    </div>
  );
};

export default React.memo(ReaderImageArea);
