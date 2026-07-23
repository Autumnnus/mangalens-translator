import { ChevronLeft, ChevronRight, Expand, Hash, X } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ProcessedImage } from "../../types";

interface SeriesIconProps {
  images: ProcessedImage[];
  previewImages?: string[];
  seriesName: string;
  imageCount?: number;
}

const SeriesIcon: React.FC<SeriesIconProps> = ({
  images,
  previewImages,
  seriesName,
  imageCount = 0,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activePreviewIndex, setActivePreviewIndex] = useState(0);

  const displayImages = useMemo(
    () =>
      [...(previewImages || []), ...images.map((image) => image.translatedUrl || image.originalUrl)]
        .filter(Boolean)
        .filter((url, index, all) => all.indexOf(url) === index),
    [images, previewImages],
  );

  useEffect(() => {
    if (!isExpanded) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsExpanded(false);
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
        className="w-10 h-10 flex items-center justify-center bg-surface-raised rounded-lg border border-border-muted group-hover:border-primary/50 transition-colors shadow-sm"
      >
        <Hash className="w-4 h-4 text-text-dark group-hover:text-primary/70" />
      </div>
    );
  }

  const openPreview = () => {
    setActivePreviewIndex(0);
    setIsExpanded(true);
  };

  const fullScreenPreview = (
    <div
      className="fixed inset-0 z-[500] flex flex-col bg-black/95 text-text-main"
      role="dialog"
      aria-modal="true"
      aria-label={`${seriesName} quick preview`}
      onClick={() => setIsExpanded(false)}
    >
      <header
        className="flex shrink-0 items-center justify-between gap-4 border-b border-white/10 bg-black/60 px-4 py-3 backdrop-blur-xl sm:px-8 sm:py-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="min-w-0">
          <p className="truncate text-base font-black uppercase tracking-tight sm:text-xl">
            {seriesName}
          </p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
            Quick preview · {imageCount || displayImages.length} page
            {imageCount === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black text-text-muted">
            {activePreviewIndex + 1} / {displayImages.length}
          </span>
          <button
            type="button"
            onClick={() => setIsExpanded(false)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-text-muted transition-colors hover:bg-white hover:text-black"
            title="Close preview"
            aria-label="Close preview"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main
        className="relative flex min-h-0 flex-1 items-center justify-center p-4 sm:p-8"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          disabled={activePreviewIndex === 0}
          onClick={() => setActivePreviewIndex((index) => index - 1)}
          className="absolute left-3 z-10 flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-black/60 text-white transition-all hover:bg-white hover:text-black disabled:pointer-events-none disabled:opacity-20 sm:left-8 sm:h-14 sm:w-14"
          aria-label="Previous preview image"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <img
          src={displayImages[activePreviewIndex]}
          alt={`${seriesName} preview ${activePreviewIndex + 1}`}
          className="max-h-full max-w-full select-none object-contain"
          draggable={false}
        />
        <button
          type="button"
          disabled={activePreviewIndex === displayImages.length - 1}
          onClick={() => setActivePreviewIndex((index) => index + 1)}
          className="absolute right-3 z-10 flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-black/60 text-white transition-all hover:bg-white hover:text-black disabled:pointer-events-none disabled:opacity-20 sm:right-8 sm:h-14 sm:w-14"
          aria-label="Next preview image"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </main>

      <footer
        className="shrink-0 border-t border-white/10 bg-black/60 px-4 py-3 backdrop-blur-xl sm:px-8"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto flex max-w-4xl gap-2 overflow-x-auto pb-1">
          {displayImages.map((url, index) => (
            <button
              type="button"
              key={url}
              onClick={() => setActivePreviewIndex(index)}
              aria-label={`Show preview image ${index + 1}`}
              aria-current={index === activePreviewIndex ? "true" : undefined}
              className={`h-16 w-11 shrink-0 overflow-hidden rounded-lg border-2 bg-black transition-all sm:h-20 sm:w-14 ${
                index === activePreviewIndex
                  ? "border-primary opacity-100 shadow-glow"
                  : "border-transparent opacity-50 hover:opacity-100"
              }`}
            >
              <img
                src={url}
                alt=""
                className="h-full w-full object-contain p-0.5"
              />
            </button>
          ))}
        </div>
      </footer>
    </div>
  );

  return (
    <>
      <button
        type="button"
        className="relative h-10 w-10 cursor-pointer rounded-lg text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
            className="absolute h-7 w-7 overflow-hidden rounded-md border border-border-muted bg-surface-raised shadow-lg transition-transform group-hover:border-primary/50"
            style={{
              top: `${index * 3}px`,
              left: `${index * 3}px`,
              zIndex: index,
              transform: `rotate(${index * 4 - 4}deg)`,
            }}
          >
            <img
              src={url}
              className="h-full w-full object-contain bg-black/80 p-0.5"
              alt=""
            />
          </span>
        ))}
        <span className="absolute -right-1 -bottom-1 z-10 flex h-4 w-4 items-center justify-center rounded-full border border-primary/30 bg-primary text-white shadow-glow">
          <Expand className="h-2.5 w-2.5" />
        </span>
      </button>
      {isExpanded &&
        typeof document !== "undefined" &&
        createPortal(fullScreenPreview, document.body)}
    </>
  );
};

export default React.memo(SeriesIcon);
