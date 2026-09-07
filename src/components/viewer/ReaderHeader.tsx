import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Image as ImageIcon,
  LayoutGrid,
  Menu,
  SkipBack,
  SkipForward,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { Series } from "../../types";
import { IconButton, Input, Mono, SegmentedControl } from "../ui";

interface ReaderHeaderProps {
  activeSeries: Series | undefined;
  currentImageIndex: number;
  imageCount: number;
  toggleViewOnly: () => void;
  /** Opens the series list (sidebar) on small screens. */
  onOpenSeriesList?: () => void;
  setCurrentImageIndex: (index: number) => void;
  currentPageGroup: number;
  totalPageGroups: number;
  pageGroupSize: number;
  onPageGroupChange: (group: number) => void;
  comparisonMode: string;
  setComparisonMode: (
    mode: "grid" | "slider" | "side-by-side" | "toggle",
  ) => void;
  children?: React.ReactNode;
}

/** Icon buttons on the theater ground: white on dark instead of ink tokens. */
const theaterButton = "text-theater-ink-2 hover:bg-theater-hover hover:text-theater-ink";

const ReaderHeader: React.FC<ReaderHeaderProps> = ({
  activeSeries,
  currentImageIndex,
  imageCount,
  toggleViewOnly,
  onOpenSeriesList,
  setCurrentImageIndex,
  currentPageGroup,
  totalPageGroups,
  pageGroupSize,
  onPageGroupChange,
  comparisonMode,
  setComparisonMode,
  children,
}) => {
  const [pageInput, setPageInput] = useState(String(currentImageIndex + 1));

  useEffect(() => {
    setPageInput(String(currentImageIndex + 1));
  }, [currentImageIndex]);

  const goToPage = (page: number) => {
    setCurrentImageIndex(Math.min(Math.max(page - 1, 0), imageCount - 1));
  };

  const commitPageInput = () => {
    const page = Number.parseInt(pageInput, 10);
    if (Number.isNaN(page)) {
      setPageInput(String(currentImageIndex + 1));
      return;
    }
    goToPage(page);
  };

  const isFirst = currentImageIndex === 0;
  const isLast = currentImageIndex === imageCount - 1;
  const groupStart = (currentPageGroup - 1) * pageGroupSize + 1;
  const groupEnd = Math.min(currentPageGroup * pageGroupSize, imageCount);
  const layout: "grid" | "single" = comparisonMode === "grid" ? "grid" : "single";
  const hasPages = imageCount > 0;

  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-theater-line bg-theater px-2 text-theater-ink">
      <div className="flex min-w-0 flex-1 items-center gap-1">
        {onOpenSeriesList && (
          <IconButton
            label="Series list"
            size="sm"
            className={`${theaterButton} md:hidden`}
            onClick={onOpenSeriesList}
          >
            <Menu />
          </IconButton>
        )}
        <IconButton
          label="Back to editor"
          size="sm"
          className={theaterButton}
          onClick={toggleViewOnly}
        >
          <ArrowLeft />
        </IconButton>
        <div className="flex min-w-0 items-baseline gap-2 pl-1">
          <h2 className="truncate text-sm font-semibold">
            {activeSeries?.name}
          </h2>
          <Mono className="hidden shrink-0 text-xs text-theater-ink-2 sm:inline">
            Page {currentImageIndex + 1} / {imageCount}
          </Mono>
        </div>
      </div>

      {hasPages && (
        <div className="flex shrink-0 items-center gap-2">
          <div
            role="group"
            aria-label="Page navigation"
            className="flex items-center gap-0.5 rounded-control border border-theater-line p-0.5"
          >
            <IconButton
              label="First page"
              size="sm"
              className={`${theaterButton} hidden sm:inline-flex`}
              onClick={() => goToPage(1)}
              disabled={isFirst}
            >
              <SkipBack />
            </IconButton>
            <IconButton
              label="Previous page"
              size="sm"
              className={theaterButton}
              onClick={() => goToPage(currentImageIndex)}
              disabled={isFirst}
            >
              <ChevronLeft />
            </IconButton>
            <Input
              type="number"
              mono
              inputSize="sm"
              min={1}
              max={imageCount}
              value={pageInput}
              onChange={(event) => setPageInput(event.target.value)}
              onBlur={commitPageInput}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              className="no-spinner w-14 text-center"
              aria-label={`Go to page, between 1 and ${imageCount}`}
            />
            <IconButton
              label="Next page"
              size="sm"
              className={theaterButton}
              onClick={() => goToPage(currentImageIndex + 2)}
              disabled={isLast}
            >
              <ChevronRight />
            </IconButton>
            <IconButton
              label="Last page"
              size="sm"
              className={`${theaterButton} hidden sm:inline-flex`}
              onClick={() => goToPage(imageCount)}
              disabled={isLast}
            >
              <SkipForward />
            </IconButton>
          </div>

          {totalPageGroups > 1 && (
            <div
              role="group"
              aria-label="Page set navigation"
              className="hidden items-center gap-0.5 rounded-control border border-theater-line p-0.5 md:flex"
            >
              <IconButton
                label="Previous page set"
                size="sm"
                className={theaterButton}
                onClick={() => onPageGroupChange(currentPageGroup - 1)}
                disabled={currentPageGroup === 1}
              >
                <ChevronsLeft />
              </IconButton>
              <Mono
                className="min-w-24 px-1 text-center text-xs text-theater-ink-2"
                title={`Set ${currentPageGroup} of ${totalPageGroups}`}
              >
                Pages {groupStart}–{groupEnd}
              </Mono>
              <IconButton
                label="Next page set"
                size="sm"
                className={theaterButton}
                onClick={() => onPageGroupChange(currentPageGroup + 1)}
                disabled={currentPageGroup === totalPageGroups}
              >
                <ChevronsRight />
              </IconButton>
            </div>
          )}

          <SegmentedControl
            label="Layout"
            size="sm"
            value={layout}
            onChange={(value) =>
              setComparisonMode(value === "grid" ? "grid" : "toggle")
            }
            options={[
              { value: "grid", icon: <LayoutGrid />, title: "Grid" },
              { value: "single", icon: <ImageIcon />, title: "Single page" },
            ]}
          />

          {children}
        </div>
      )}
    </header>
  );
};

export default React.memo(ReaderHeader);
