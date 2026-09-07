import { ChevronLeft, ChevronRight } from "lucide-react";
import React, { useEffect, useState } from "react";
import { ProcessedImage } from "../../types";
import { getThumbnailUrl } from "../../utils/url";
import { IconButton, Input, Mono } from "../ui";

interface ThumbnailStripProps {
  images: ProcessedImage[];
  currentThumbSet: ProcessedImage[];
  currentImageIndex: number;
  currentThumbPage: number;
  totalThumbPages: number;
  comparisonMode: string;
  onSelectIndex: (index: number) => void;
  onPageChange: (page: number) => void;
  isOverlay?: boolean;
}

/** Icon buttons on the theater ground: white on dark instead of ink tokens. */
const theaterButton = "text-theater-ink-2 hover:bg-theater-hover hover:text-theater-ink";

const tileClass = (active: boolean) =>
  `relative shrink-0 overflow-hidden rounded-control border-2 bg-theater transition-colors duration-120 ${
    active ? "border-action" : "border-theater-line hover:border-theater-line"
  }`;

const ThumbnailStrip: React.FC<ThumbnailStripProps> = ({
  images,
  currentThumbSet,
  currentImageIndex,
  currentThumbPage,
  totalThumbPages,
  comparisonMode,
  onSelectIndex,
  onPageChange,
  isOverlay = false,
}) => {
  const [pageInput, setPageInput] = useState(String(currentThumbPage + 1));

  useEffect(() => {
    setPageInput(String(currentThumbPage + 1));
  }, [currentThumbPage]);

  const changePage = (page: number) => {
    onPageChange(Math.min(Math.max(page, 1), totalThumbPages));
  };

  const commitPageInput = () => {
    const page = Number.parseInt(pageInput, 10);
    if (Number.isNaN(page)) {
      setPageInput(String(currentThumbPage + 1));
      return;
    }
    changePage(page);
  };

  const isGrid = comparisonMode === "grid";

  return (
    <div
      className={`shrink-0 bg-theater p-3 text-theater-ink ${
        isOverlay
          ? "border-y border-theater-line sm:rounded-panel sm:border"
          : "rounded-panel border border-theater-line"
      } ${isGrid ? "max-h-[72vh] overflow-y-auto sm:max-h-[60vh]" : ""}`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-theater-ink-2">
            <span className="hidden sm:inline">Set</span>
            <Input
              type="number"
              mono
              inputSize="sm"
              min={1}
              max={totalThumbPages}
              value={pageInput}
              onChange={(event) => setPageInput(event.target.value)}
              onBlur={commitPageInput}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              className="no-spinner w-14 text-center"
              aria-label={`Go to thumbnail set, between 1 and ${totalThumbPages}`}
            />
            <Mono>/ {totalThumbPages}</Mono>
          </label>
          {!isOverlay && (
            <Mono className="hidden text-xs text-theater-ink-2 sm:inline">
              {images.length} pages
            </Mono>
          )}
        </div>

        <div className="flex items-center gap-0.5 rounded-control border border-theater-line p-0.5">
          <IconButton
            label="Previous set"
            size="sm"
            className={theaterButton}
            onClick={() => changePage(currentThumbPage)}
            disabled={currentThumbPage === 0}
          >
            <ChevronLeft />
          </IconButton>
          <IconButton
            label="Next set"
            size="sm"
            className={theaterButton}
            onClick={() => changePage(currentThumbPage + 2)}
            disabled={currentThumbPage >= totalThumbPages - 1}
          >
            <ChevronRight />
          </IconButton>
        </div>
      </div>

      {isGrid ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-10">
          {currentThumbSet.map((img) => {
            const idx = images.findIndex((i) => i.id === img.id);
            const active = idx === currentImageIndex;
            return (
              <button
                key={img.id}
                type="button"
                onClick={() => onSelectIndex(idx)}
                aria-current={active ? "true" : undefined}
                aria-label={`Open page ${idx + 1}`}
                className={`${tileClass(active)} aspect-[3/4] sm:aspect-[2/3]`}
              >
                <img
                  src={getThumbnailUrl(img.originalKey, img.originalUrl, 180, 66)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-contain p-1 transition-opacity duration-200"
                  onLoad={(e) => (e.currentTarget.style.opacity = "1")}
                  style={{ opacity: 0 }}
                />
                <Mono className="absolute bottom-1 left-1 rounded-chip bg-theater px-1.5 py-0.5 text-xs text-theater-ink-2">
                  {idx + 1}
                </Mono>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="no-scrollbar flex items-center justify-start gap-2 overflow-x-auto pb-1 sm:justify-center sm:gap-3">
          {currentThumbSet.map((img) => {
            const idx = images.findIndex((i) => i.id === img.id);
            const active = idx === currentImageIndex;
            return (
              <button
                key={img.id}
                type="button"
                onClick={() => onSelectIndex(idx)}
                aria-current={active ? "true" : undefined}
                aria-label={`Open page ${idx + 1}`}
                className={`${tileClass(active)} h-24 w-16 sm:h-36 sm:w-24 ${
                  active ? "" : "opacity-60 hover:opacity-100"
                }`}
              >
                <img
                  src={getThumbnailUrl(img.originalKey, img.originalUrl, 220, 68)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-contain p-1 transition-opacity duration-200"
                  onLoad={(e) => (e.currentTarget.style.opacity = "1")}
                  style={{ opacity: 0 }}
                />
                <Mono className="absolute bottom-1 left-1 rounded-chip bg-theater px-1.5 py-0.5 text-xs text-theater-ink-2">
                  {idx + 1}
                </Mono>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default React.memo(ThumbnailStrip);
