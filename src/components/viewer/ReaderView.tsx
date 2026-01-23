import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSeriesStore } from "../../stores/useSeriesStore";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { useUIStore } from "../../stores/useUIStore";
import { ViewMode } from "../../types";
import ViewModeControls from "../ViewModeControls";
import ReaderHeader from "./ReaderHeader";
import ReaderImageArea from "./ReaderImageArea";
import ThumbnailStrip from "./ThumbnailStrip";

const ReaderView: React.FC = () => {
  // Selective store access
  const series = useSeriesStore((state) => state.series);
  const activeSeriesId = useSeriesStore((state) => state.activeSeriesId);
  const currentImageIndex = useUIStore((state) => state.currentImageIndex);
  const setCurrentImageIndex = useUIStore(
    (state) => state.setCurrentImageIndex,
  );
  const toggleViewOnly = useSettingsStore((state) => state.toggleViewOnly);

  const [showComparison, setShowComparison] = useState(false);
  const [comparisonMode, setComparisonMode] = useState<ViewMode>("slider");

  const activeSeries = useMemo(
    () => series.find((s) => s.id === activeSeriesId),
    [series, activeSeriesId],
  );
  const images = useMemo(() => activeSeries?.images || [], [activeSeries]);

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

  if (images.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-10 opacity-50">
        <p>No images to view.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full animate-in fade-in duration-700 min-h-0">
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
        />
      )}

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
      />
    </div>
  );
};

export default React.memo(ReaderView);
