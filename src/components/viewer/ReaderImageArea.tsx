import React, { useState } from "react";
import {
  ReactZoomPanPinchRef,
  TransformComponent,
  TransformWrapper,
  useTransformContext,
} from "react-zoom-pan-pinch";
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
  onToggleUI: () => void;
  isUIVisible: boolean;
}

const ZoomStateIndicator = () => {
  const { transformState } = useTransformContext();
  const scale = transformState.scale;

  if (scale <= 1.05) return null;

  return (
    <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-md px-4 py-2 rounded-full text-white text-[10px] font-black uppercase tracking-widest border border-white/20 z-[100] pointer-events-none">
      Zoom: {Math.round(scale * 100)}%
    </div>
  );
};

const ReaderImageArea: React.FC<ReaderImageAreaProps> = ({
  currentImage,
  showComparison,
  comparisonMode,
  onNext,
  onPrev,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  onToggleUI,
  isUIVisible,
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);

  const getPair = (img: ProcessedImage) => ({
    id: img.id,
    title: img.fileName,
    sourceUrl: img.originalUrl,
    convertedUrl: img.translatedUrl || img.originalUrl,
    createdAt: 0,
  });

  const displayUrl = currentImage?.translatedUrl || currentImage?.originalUrl;

  const handleTransform = (ref: ReactZoomPanPinchRef) => {
    setIsZoomed(ref.state.scale > 1.05);
  };

  return (
    <div
      className={`flex-1 min-h-0 flex items-center justify-center relative overflow-hidden transition-colors duration-500 ${isUIVisible ? "bg-background/20" : "bg-black"}`}
    >
      {/* Navigation Areas - Only when not zoomed */}
      {!isZoomed && (
        <>
          <div
            className="absolute inset-y-0 left-0 w-1/6 z-40 cursor-pointer group/nav"
            onClick={(e) => {
              e.stopPropagation();
              onPrev();
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-black/40 to-transparent opacity-0 group-hover/nav:opacity-100 transition-opacity flex items-center justify-start pl-8">
              <div className="w-12 h-12 rounded-2xl bg-surface/60 backdrop-blur-xl flex items-center justify-center border border-border-muted text-text-main hover:scale-110 transition-all shadow-premium">
                <i className="fas fa-chevron-left text-sm"></i>
              </div>
            </div>
          </div>

          <div
            className="absolute inset-y-0 right-0 w-1/6 z-40 cursor-pointer group/nav"
            onClick={(e) => {
              e.stopPropagation();
              onNext();
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-l from-black/40 to-transparent opacity-0 group-hover/nav:opacity-100 transition-opacity flex items-center justify-end pr-8">
              <div className="w-12 h-12 rounded-2xl bg-surface/60 backdrop-blur-xl flex items-center justify-center border border-border-muted text-text-main hover:scale-110 transition-all shadow-premium">
                <i className="fas fa-chevron-right text-sm"></i>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Main Content Area (Zoomable) */}
      <div
        className="w-full h-full flex items-center justify-center relative z-10"
        onTouchStart={(e) => !isZoomed && onTouchStart(e)}
        onTouchMove={(e) => !isZoomed && onTouchMove(e)}
        onTouchEnd={() => !isZoomed && onTouchEnd()}
      >
        <TransformWrapper
          initialScale={1}
          minScale={1}
          maxScale={8}
          centerOnInit={true}
          onTransformed={handleTransform}
          doubleClick={{ disabled: false, step: 0.5 }}
          wheel={{ disabled: false }}
          panning={{ disabled: !isZoomed, velocityDisabled: false }}
        >
          <TransformComponent
            wrapperClass="!w-full !h-full"
            contentClass="!w-full !h-full flex items-center justify-center"
          >
            <div
              key={`${currentImage?.id}-${showComparison}-${comparisonMode}`}
              className={`relative w-full h-full flex items-center justify-center ${isZoomed ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"}`}
              onClick={(e) => {
                if (e.detail === 1) {
                  const timer = setTimeout(() => {
                    if (!isZoomed) onToggleUI();
                  }, 250);
                  return () => clearTimeout(timer);
                }
              }}
            >
              {!isLoaded && !showComparison && (
                <div className="absolute inset-0 flex items-center justify-center z-20">
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                  </div>
                </div>
              )}

              {error && (
                <div className="absolute inset-0 flex items-center justify-center z-20">
                  <div className="p-8 rounded-2xl bg-surface/80 backdrop-blur-xl border border-red-500/30 text-center">
                    <i className="fas fa-exclamation-circle text-red-500 text-3xl mb-4" />
                    <p className="text-text-main font-medium">
                      Failed to load page
                    </p>
                  </div>
                </div>
              )}

              {showComparison && currentImage.translatedUrl ? (
                <div className="w-full h-full max-w-5xl mx-auto p-4 md:p-8">
                  <ComparisonView
                    pair={getPair(currentImage)}
                    mode={comparisonMode}
                    interactive={!isZoomed}
                  />
                </div>
              ) : (
                <img
                  key={displayUrl}
                  src={displayUrl}
                  onLoad={() => setIsLoaded(true)}
                  onError={() => {
                    setIsLoaded(true);
                    setError(true);
                  }}
                  className={`max-w-full max-h-full md:max-h-[85vh] object-contain shadow-2xl select-none transition-opacity duration-500 ${isLoaded ? "opacity-100" : "opacity-0"}`}
                  alt="Page"
                  draggable={false}
                />
              )}
            </div>
          </TransformComponent>
          <ZoomStateIndicator />
        </TransformWrapper>
      </div>
    </div>
  );
};

export default React.memo(ReaderImageArea);
