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
  const [isLoaded, setIsLoaded] = React.useState(false);
  const [error, setError] = React.useState(false);

  // Reset loading state when image changes
  React.useEffect(() => {
    setIsLoaded(false);
    setError(false);
  }, [currentImage?.id]);

  const getPair = (img: ProcessedImage) => ({
    id: img.id,
    title: img.fileName,
    sourceUrl: img.originalUrl,
    convertedUrl: img.translatedUrl || img.originalUrl,
    createdAt: 0,
  });

  const displayUrl = currentImage?.translatedUrl || currentImage?.originalUrl;

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
        {!isLoaded && !showComparison && (
          <div className="absolute inset-0 flex items-center justify-center z-20">
            <div className="w-full max-w-lg aspect-2/3 bg-surface-muted/30 rounded-2xl animate-pulse flex items-center justify-center border border-border-muted overflow-hidden">
              <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                <p className="text-text-muted text-sm font-medium tracking-wide">
                  Optimizing Image...
                </p>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center z-20">
            <div className="p-8 rounded-2xl bg-surface/80 backdrop-blur-xl border border-red-500/30 text-center">
              <i className="fas fa-exclamation-circle text-red-500 text-3xl mb-4" />
              <p className="text-text-main font-medium">Failed to load page</p>
              <button
                onClick={() => {
                  setError(false);
                  setIsLoaded(false);
                }}
                className="mt-4 px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg transition-colors border border-primary/20"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {showComparison && currentImage.translatedUrl ? (
          <div className="w-full h-full max-w-5xl mx-auto">
            <ComparisonView
              pair={getPair(currentImage)}
              mode={comparisonMode}
            />
          </div>
        ) : (
          <img
            key={displayUrl} // Force re-render on image change to trigger onLoad
            src={displayUrl}
            onLoad={() => setIsLoaded(true)}
            onError={() => {
              setIsLoaded(true);
              setError(true);
            }}
            className={`max-w-full max-h-full object-contain shadow-glow-premium select-none rounded-xl transition-all duration-500 ${isLoaded ? "opacity-100 scale-100" : "opacity-0 scale-95"}`}
            alt="Page"
            draggable={false}
          />
        )}
      </div>

      <div className="absolute inset-0 z-0 opacity-20 pointer-events-none">
        <img
          src={displayUrl}
          alt=""
          loading="lazy"
          className="w-full h-full object-cover blur-3xl scale-110"
        />
      </div>
    </div>
  );
};

export default React.memo(ReaderImageArea);
