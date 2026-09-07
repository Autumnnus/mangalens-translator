import { ImageOff } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSeriesStore } from "../../stores/useSeriesStore";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { useUIStore } from "../../stores/useUIStore";
import { ViewMode } from "../../types";
import { Spinner } from "../ui";
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
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);
  const toggleViewOnly = useSettingsStore((state) => state.toggleViewOnly);

  const prevSeriesIdRef = useRef(activeSeriesId);

  useEffect(() => {
    if (activeSeriesId !== prevSeriesIdRef.current) {
      prevSeriesIdRef.current = activeSeriesId;
      setCurrentImageIndex(0);
    }
  }, [activeSeriesId, setCurrentImageIndex]);

  const [showComparison, setShowComparison] = useState(false);
  const [comparisonMode, setComparisonMode] = useState<ViewMode>("toggle");
  const [isUIVisible, setIsUIVisible] = useState(true);

  const activeSeries = useMemo(
    () => seriesListData?.items.find((s) => s.id === activeSeriesId),
    [seriesListData, activeSeriesId],
  );
  const images = useMemo(() => imagesData || [], [imagesData]);

  const thumbnailsPerPage = 20;
  const currentThumbPage = Math.floor(currentImageIndex / thumbnailsPerPage);
  const totalThumbPages = Math.ceil(images.length / thumbnailsPerPage);
  const currentPageGroup = currentThumbPage + 1;

  const currentThumbSet = useMemo(() => {
    const start = currentThumbPage * thumbnailsPerPage;
    return images.slice(start, start + thumbnailsPerPage);
  }, [images, currentThumbPage]);

  const currentImage = images[currentImageIndex];

  useEffect(() => {
    if (images.length > 0 && currentImageIndex >= images.length) {
      setCurrentImageIndex(images.length - 1);
    }
  }, [currentImageIndex, images.length, setCurrentImageIndex]);

  const handleNext = useCallback(() => {
    setCurrentImageIndex(Math.min(currentImageIndex + 1, images.length - 1));
  }, [currentImageIndex, images.length, setCurrentImageIndex]);

  const handlePrev = useCallback(() => {
    setCurrentImageIndex(Math.max(0, currentImageIndex - 1));
  }, [currentImageIndex, setCurrentImageIndex]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target?.closest(
          "input, textarea, select, [contenteditable='true']",
        )
      ) {
        return;
      }
      if (e.key === "ArrowRight") handleNext();
      if (e.key === "ArrowLeft") handlePrev();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleNext, handlePrev]);

  const handleThumbPageChange = useCallback((page: number) => {
    setCurrentImageIndex(
      Math.min(images.length - 1, Math.max(0, (page - 1) * thumbnailsPerPage)),
    );
  }, [images.length, setCurrentImageIndex, thumbnailsPerPage]);

  const handleOpenSeriesList = useCallback(() => {
    toggleSidebar(true);
  }, [toggleSidebar]);

  if (
    isImagesLoading ||
    (images.length === 0 && (activeSeries?.imageCount || 0) > 0)
  ) {
    return (
      <div className="flex flex-1 items-center justify-center bg-theater p-10 text-theater-ink">
        <div className="flex items-center gap-3 text-sm text-theater-ink-2">
          <Spinner size="md" className="text-action" label="Opening pages" />
          Opening pages…
        </div>
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className="relative flex h-full min-h-0 flex-1 flex-col bg-theater text-theater-ink">
        <ReaderHeader
          activeSeries={activeSeries}
          currentImageIndex={currentImageIndex}
          imageCount={0}
          toggleViewOnly={toggleViewOnly}
          onOpenSeriesList={handleOpenSeriesList}
          setCurrentImageIndex={setCurrentImageIndex}
          currentPageGroup={1}
          totalPageGroups={0}
          pageGroupSize={thumbnailsPerPage}
          onPageGroupChange={handleThumbPageChange}
          comparisonMode={comparisonMode}
          setComparisonMode={setComparisonMode}
        />
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-10 text-center">
          <span
            aria-hidden="true"
            className="mb-4 flex h-12 w-12 items-center justify-center rounded-panel border border-theater-line text-theater-ink-2 [&_svg]:h-5 [&_svg]:w-5"
          >
            <ImageOff />
          </span>
          <h2 className="text-base font-semibold">No pages yet</h2>
          <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-theater-ink-2">
            This series is empty. Go back to the editor to add pages.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col bg-theater text-theater-ink">
      <div
        className={`absolute inset-x-0 z-(--z-bar) transition-[top] duration-200 ease-out ${
          isUIVisible ? "top-0" : "pointer-events-none -top-11"
        }`}
      >
        <ReaderHeader
          activeSeries={activeSeries}
          currentImageIndex={currentImageIndex}
          imageCount={images.length}
          toggleViewOnly={toggleViewOnly}
          onOpenSeriesList={handleOpenSeriesList}
          setCurrentImageIndex={setCurrentImageIndex}
          currentPageGroup={currentPageGroup}
          totalPageGroups={totalThumbPages}
          pageGroupSize={thumbnailsPerPage}
          onPageGroupChange={handleThumbPageChange}
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

      <div className="relative flex min-h-0 flex-1 flex-col">
        {comparisonMode === "grid" ? (
          <div className="flex-1 overflow-y-auto px-4 pb-4 pt-15 md:px-6 md:pb-6">
            <ThumbnailStrip
              images={images}
              currentThumbSet={currentThumbSet}
              currentImageIndex={currentImageIndex}
              currentThumbPage={currentThumbPage}
              totalThumbPages={totalThumbPages}
              comparisonMode={comparisonMode}
              onSelectIndex={(idx) => {
                setCurrentImageIndex(idx);
                setComparisonMode("toggle");
              }}
              onPageChange={handleThumbPageChange}
              isOverlay={false}
            />
          </div>
        ) : (
          <ReaderImageArea
            images={images}
            currentIndex={currentImageIndex}
            onIndexChange={setCurrentImageIndex}
            showComparison={showComparison}
            comparisonMode={comparisonMode}
            onToggleUI={() => setIsUIVisible(!isUIVisible)}
            isUIVisible={isUIVisible}
          />
        )}
      </div>
    </div>
  );
};

export default React.memo(ReaderView);
