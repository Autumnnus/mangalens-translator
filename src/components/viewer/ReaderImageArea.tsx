import React, { useCallback, useRef, useState } from "react";
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
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [lastTapTime, setLastTapTime] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);

  const toggleZoom = useCallback(
    (clientX?: number, clientY?: number) => {
      if (scale > 1) {
        setScale(1);
        setPosition({ x: 0, y: 0 });
      } else {
        const newScale = 2.5;
        setScale(newScale);

        if (
          clientX !== undefined &&
          clientY !== undefined &&
          contentRef.current
        ) {
          const rect = contentRef.current.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;

          // Calculate displacement to keep the clicked point under the cursor/finger
          const dx = (centerX - clientX) * (newScale - 1);
          const dy = (centerY - clientY) * (newScale - 1);

          setPosition({ x: dx, y: dy });
        }
      }
    },
    [scale],
  );

  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && scale > 1) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  // Custom Touch/Click handling
  const handleContentClick = (e: React.MouseEvent) => {
    // Only toggle UI if it was a single click and not zooming
    if (e.detail === 1) {
      // Delay slightly to wait for second click in case of double click
      setTimeout(() => {
        // detail 1 means it wasn't intercepted as a double click by the browser standard
        // But we handle zoom via onDoubleClick usually.
        // If we want to be safe, we only toggle UI on single click if scale is 1
        if (scale === 1) {
          onToggleUI();
        }
      }, 200);
    }
  };

  const handleTouchStartCustom = (e: React.TouchEvent) => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;
    const touch = e.touches[0];

    if (now - lastTapTime < DOUBLE_TAP_DELAY) {
      toggleZoom(touch.clientX, touch.clientY);
      setLastTapTime(0);
    } else {
      setLastTapTime(now);
      if (scale === 1) {
        setTimeout(() => {
          setLastTapTime((prev) => {
            if (prev === now) {
              onToggleUI();
              return 0;
            }
            return prev;
          });
        }, DOUBLE_TAP_DELAY);
      }
    }
  };

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
      className={`flex-1 min-h-0 flex items-center justify-center relative overflow-hidden transition-colors duration-500 ${isUIVisible ? "bg-background/20" : "bg-black"}`}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Navigation Areas - Only when not zoomed */}
      {scale === 1 && (
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
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div
          key={`${currentImage?.id}-${showComparison}-${comparisonMode}`}
          className={`relative transition-all duration-300 w-full h-full flex items-center justify-center ${scale > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"}`}
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transition: isDragging ? "none" : "transform 0.3s ease-out",
            touchAction: scale > 1 ? "none" : "pan-y",
          }}
          onClick={handleContentClick}
          onDoubleClick={(e) => {
            e.stopPropagation();
            toggleZoom(e.clientX, e.clientY);
          }}
          onTouchStart={(e) => {
            handleTouchStartCustom(e);
          }}
          onMouseDown={handleMouseDown}
          ref={contentRef}
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
                interactive={scale === 1}
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
              className={`max-w-full max-h-full md:max-h-[95vh] object-contain shadow-2xl select-none transition-opacity duration-500 ${isLoaded ? "opacity-100" : "opacity-0"}`}
              alt="Page"
              draggable={false}
            />
          )}

          {scale > 1 && (
            <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-md px-4 py-2 rounded-full text-white text-[10px] font-black uppercase tracking-widest border border-white/20 z-[100]">
              Zoom: {Math.round(scale * 100)}%
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(ReaderImageArea);
