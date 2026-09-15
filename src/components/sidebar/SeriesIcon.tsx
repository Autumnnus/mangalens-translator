import {
  ChevronLeft,
  ChevronRight,
  Expand,
  Image as ImageIcon,
} from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSeriesImagesQuery } from "../../hooks/useSeriesQueries";
import { ProcessedImage } from "../../types";
import { cn } from "../../utils/cn";
import { resolveImageUrl } from "../../utils/url";
import { FullscreenShell, IconButton, Mono } from "../ui";

interface SeriesIconProps {
  seriesId: string;
  images: ProcessedImage[];
  previewImages?: string[];
  seriesName: string;
  imageCount?: number;
}

/**
 * Three stacked page thumbnails. Click opens a modal quick preview with
 * arrow-key and touch navigation.
 */
const SeriesIcon: React.FC<SeriesIconProps> = ({
  seriesId,
  images,
  previewImages,
  seriesName,
  imageCount = 0,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activePreviewIndex, setActivePreviewIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);

  const { data: fullSeriesImages, isLoading: isLoadingFullSeries } =
    useSeriesImagesQuery(seriesId, isExpanded);

  const displayImages = useMemo(
    () => {
      const loadedImages = fullSeriesImages?.length ? fullSeriesImages : images;
      const urls = loadedImages.length
        ? loadedImages.map(
            (image) => resolveImageUrl(image.translatedUrl || image.originalUrl),
          )
        : (previewImages || []).map((url) => resolveImageUrl(url));

      return urls.filter(Boolean).filter((url, index, all) => all.indexOf(url) === index);
    },
    [fullSeriesImages, images, previewImages],
  );

  useEffect(() => {
    if (!isExpanded) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        setActivePreviewIndex((index) => Math.max(0, index - 1));
      }
      if (event.key === "ArrowRight") {
        setActivePreviewIndex((index) =>
          Math.min(displayImages.length - 1, index + 1),
        );
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [displayImages.length, isExpanded]);

  if (displayImages.length === 0) {
    return (
      <div
        title={`${seriesName}: no preview available`}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-line bg-page-2 text-ink-3"
      >
        <ImageIcon aria-hidden="true" className="h-4 w-4" />
      </div>
    );
  }

  const openPreview = () => {
    setActivePreviewIndex(0);
    setIsExpanded(true);
  };

  const pageCount = imageCount || displayImages.length;
  const theaterButton =
    "text-theater-ink-2 hover:bg-theater-hover hover:text-theater-ink disabled:hover:bg-transparent";

  return (
    <>
      <button
        type="button"
        className="group/icon relative h-9 w-9 shrink-0 rounded-control text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
        onClick={(event) => {
          event.stopPropagation();
          openPreview();
        }}
        title={`Open ${seriesName} preview`}
        aria-label={`Open ${seriesName} full-screen preview`}
      >
        {displayImages.slice(0, 3).map((url, index) => (
          <span
            key={`${url}-${index}`}
            className="absolute h-7 w-7 overflow-hidden rounded-chip border border-line bg-page-2"
            style={{
              top: `${index * 2}px`,
              left: `${index * 2}px`,
              zIndex: index,
            }}
          >
            <img src={url} className="h-full w-full object-cover" alt="" />
          </span>
        ))}
        <span
          aria-hidden="true"
          className="absolute -bottom-0.5 -right-0.5 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-action text-on-action opacity-0 transition-opacity duration-120 group-hover/icon:opacity-100 group-focus-visible/icon:opacity-100"
        >
          <Expand className="h-2.5 w-2.5" />
        </span>
      </button>

      <FullscreenShell
        open={isExpanded}
        onClose={() => setIsExpanded(false)}
        theater
        layer="lightbox"
        presentation="modal"
        title={seriesName}
        subtitle={`${isLoadingFullSeries ? "Loading pages… · " : "Quick preview · "}${pageCount} page${pageCount === 1 ? "" : "s"}`}
        icon={<ImageIcon />}
        closeLabel="Close preview (Esc)"
        actions={
          <Mono className="text-xs text-theater-ink-2">
            {activePreviewIndex + 1} / {displayImages.length}
          </Mono>
        }
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <main
            className="relative flex min-h-0 flex-1 items-center justify-center p-4 sm:p-8"
            style={{ touchAction: "pan-y" }}
            onTouchStart={(event) => {
              touchStartX.current = event.changedTouches[0]?.clientX ?? null;
            }}
            onTouchEnd={(event) => {
              const startX = touchStartX.current;
              const endX = event.changedTouches[0]?.clientX;
              touchStartX.current = null;
              if (startX === null || endX === undefined) return;

              const deltaX = endX - startX;
              if (Math.abs(deltaX) < 40) return;
              if (deltaX < 0) {
                setActivePreviewIndex((index) =>
                  Math.min(displayImages.length - 1, index + 1),
                );
              } else {
                setActivePreviewIndex((index) => Math.max(0, index - 1));
              }
            }}
          >
            <IconButton
              label="Previous page"
              size="lg"
              disabled={activePreviewIndex === 0}
              onClick={() => setActivePreviewIndex((index) => index - 1)}
              className={cn("absolute left-3 z-10 sm:left-6", theaterButton)}
            >
              <ChevronLeft />
            </IconButton>
            <img
              src={displayImages[activePreviewIndex]}
              alt={`${seriesName} preview ${activePreviewIndex + 1}`}
              className="max-h-full max-w-full select-none object-contain"
              draggable={false}
            />
            <IconButton
              label="Next page"
              size="lg"
              disabled={activePreviewIndex === displayImages.length - 1}
              onClick={() => setActivePreviewIndex((index) => index + 1)}
              className={cn("absolute right-3 z-10 sm:right-6", theaterButton)}
            >
              <ChevronRight />
            </IconButton>
          </main>

          <footer className="shrink-0 border-t border-theater-line bg-theater px-4 py-3 sm:px-8">
            <div className="mx-auto flex max-w-4xl gap-2 overflow-x-auto pb-1">
              {displayImages.map((url, index) => (
                <button
                  type="button"
                  key={url}
                  onClick={() => setActivePreviewIndex(index)}
                  aria-label={`Show page ${index + 1}`}
                  aria-current={index === activePreviewIndex ? "true" : undefined}
                  className={cn(
                    "h-16 w-11 shrink-0 overflow-hidden rounded-chip border-2 bg-theater transition-colors duration-120 sm:h-20 sm:w-14",
                    index === activePreviewIndex
                      ? "border-action opacity-100"
                      : "border-transparent opacity-50 hover:opacity-100",
                  )}
                >
                  <img src={url} alt="" className="h-full w-full object-contain" />
                </button>
              ))}
            </div>
          </footer>
        </div>
      </FullscreenShell>
    </>
  );
};

export default React.memo(SeriesIcon);
