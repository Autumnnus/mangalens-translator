import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSeriesStore } from "../../stores/useSeriesStore";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { useUIStore } from "../../stores/useUIStore";
import { ViewMode } from "../../types";
import ViewModeControls from "../ViewModeControls";
import ReaderHeader from "./ReaderHeader";
import ReaderImageArea from "./ReaderImageArea";
import ThumbnailStrip from "./ThumbnailStrip";

import {
  useSeriesImagesQuery,
  useSeriesQuery,
} from "../../hooks/useSeriesQueries";

const ReaderView: React.FC = () => {
  // Selective store access
  const activeSeriesId = useSeriesStore((state) => state.activeSeriesId);

  const { data: seriesListData } = useSeriesQuery();
  const { data: imagesData, isLoading: isImagesLoading } =
    useSeriesImagesQuery(activeSeriesId);

  const currentImageIndex = useUIStore((state) => state.currentImageIndex);
  const setCurrentImageIndex = useUIStore(
    (state) => state.setCurrentImageIndex,
  );
  const toggleViewOnly = useSettingsStore((state) => state.toggleViewOnly);

  const [showComparison, setShowComparison] = useState(false);
  const [comparisonMode, setComparisonMode] = useState<ViewMode>("slider");
  const [isUIVisible, setIsUIVisible] = useState(true);

  const activeSeries = useMemo(
    () => seriesListData?.items.find((s) => s.id === activeSeriesId),
    [seriesListData, activeSeriesId],
  );
  const images = useMemo(() => imagesData || [], [imagesData]);

  const thumbnailsPerPage = 20;
  const currentThumbPage = Math.floor(currentImageIndex / thumbnailsPerPage);
  const totalThumbPages = Math.ceil(images.length / thumbnailsPerPage);

  const currentThumbSet = useMemo(() => {
    const start = currentThumbPage * thumbnailsPerPage;
    return images.slice(start, start + thumbnailsPerPage);
  }, [images, currentThumbPage]);

  const currentImage = images[currentImageIndex];

  const handleNext = useCallback(() => {
    setCurrentImageIndex(Math.min(currentImageIndex + 1, images.length - 1));
  }, [currentImageIndex, images.length, setCurrentImageIndex]);

  const handlePrev = useCallback(() => {
    setCurrentImageIndex(Math.max(0, currentImageIndex - 1));
  }, [currentImageIndex, setCurrentImageIndex]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") handleNext();
      if (e.key === "ArrowLeft") handlePrev();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleNext, handlePrev]);

  // Touch Handling
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const minSwipeDistance = 50;
    if (distance > minSwipeDistance) handleNext();
    if (distance < -minSwipeDistance) handlePrev();
  }, [touchStart, touchEnd, handleNext, handlePrev]);

  const handleThumbPagePrev = useCallback(() => {
    setCurrentImageIndex(Math.max(0, currentImageIndex - thumbnailsPerPage));
  }, [currentImageIndex, setCurrentImageIndex]);

  const handleThumbPageNext = useCallback(() => {
    setCurrentImageIndex(
      Math.min(images.length - 1, currentImageIndex + thumbnailsPerPage),
    );
  }, [currentImageIndex, images.length, setCurrentImageIndex]);

  if (
    isImagesLoading ||
    (images.length === 0 && (activeSeries?.imageCount || 0) > 0)
  ) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-10">
        <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-6" />
        <h3 className="text-xl font-bold text-text-main mb-2">
          Opening Grimoire...
        </h3>
        <p className="text-text-muted animate-pulse">
          Fetching and signing pages for your viewing pleasure.
        </p>
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-20 text-center">
        <div className="w-20 h-20 bg-surface-muted/30 rounded-3xl flex items-center justify-center mb-6">
          <i className="fas fa-image-slash text-3xl text-text-muted/40" />
        </div>
        <h3 className="text-xl font-bold text-text-main mb-2">
          No Pages Found
        </h3>
        <p className="text-text-muted max-w-xs">
          This series is currently empty. Add some images in the editor to get
          started.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full animate-in fade-in duration-700 min-h-0 relative bg-black">
      <div
        className={`absolute top-0 left-0 right-0 z-[100] transition-all duration-500 ease-in-out ${isUIVisible ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0 pointer-events-none"}`}
      >
        <ReaderHeader
          activeSeries={activeSeries}
          currentImageIndex={currentImageIndex}
          imageCount={images.length}
          toggleViewOnly={toggleViewOnly}
          setCurrentImageIndex={setCurrentImageIndex}
          comparisonMode={comparisonMode}
          setComparisonMode={setComparisonMode}
        >
          {comparisonMode !== "grid" && (
            <ViewModeControls
              showComparison={showComparison}
              onToggleComparison={() => setShowComparison(!showComparison)}
              comparisonMode={comparisonMode}
              onChangeMode={setComparisonMode}
              hasTranslation={!!currentImage?.translatedUrl}
            />
          )}
        </ReaderHeader>
      </div>

      <div className="flex-1 flex flex-col min-h-0 relative">
        {comparisonMode !== "grid" && (
          <ReaderImageArea
            currentImage={currentImage}
            showComparison={showComparison}
            comparisonMode={comparisonMode}
            onNext={handleNext}
            onPrev={handlePrev}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onToggleUI={() => setIsUIVisible(!isUIVisible)}
            isUIVisible={isUIVisible}
          />
        )}
      </div>

      <div
        className={`fixed md:relative bottom-0 left-0 right-0 z-[100] transition-all duration-500 ease-in-out ${isUIVisible ? "translate-y-0 opacity-100" : "translate-y-full opacity-0 pointer-events-none"}`}
      >
        <ThumbnailStrip
          images={images}
          currentThumbSet={currentThumbSet}
          currentImageIndex={currentImageIndex}
          currentThumbPage={currentThumbPage}
          totalThumbPages={totalThumbPages}
          comparisonMode={comparisonMode}
          onSelectIndex={setCurrentImageIndex}
          onPagePrev={handleThumbPagePrev}
          onPageNext={handleThumbPageNext}
          isOverlay={true}
        />
      </div>
    </div>
  );
};

export default React.memo(ReaderView);
