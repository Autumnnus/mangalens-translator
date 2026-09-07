"use client";

import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { cn } from "../../utils/cn";
import { IconButton, Input, Mono } from "../ui";

interface EditorPaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  placement?: "top" | "bottom";
}

const EditorPagination: React.FC<EditorPaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  placement = "bottom",
}) => {
  const [pageInput, setPageInput] = useState(String(currentPage));

  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  const goTo = (page: number) => {
    onPageChange(Math.min(Math.max(page, 1), totalPages));
  };

  const commitPageInput = () => {
    const page = Number.parseInt(pageInput, 10);
    if (Number.isNaN(page)) {
      setPageInput(String(currentPage));
      return;
    }
    goTo(page);
  };

  const pageNumbers = useMemo(() => {
    const candidates = new Set([
      1,
      totalPages,
      currentPage - 1,
      currentPage,
      currentPage + 1,
    ]);
    return [...candidates]
      .filter((page) => page >= 1 && page <= totalPages)
      .sort((a, b) => a - b);
  }, [currentPage, totalPages]);

  if (totalPages <= 1) return null;

  return (
    <nav
      aria-label="Page navigation"
      className={cn(
        "flex items-center justify-center gap-1.5 py-3",
        placement === "top" ? "mb-3 border-b border-line-2" : "mt-6 border-t border-line-2",
      )}
    >
      <IconButton
        label="First screen"
        size="sm"
        variant="secondary"
        disabled={currentPage === 1}
        onClick={() => goTo(1)}
      >
        <ChevronsLeft />
      </IconButton>
      <IconButton
        label="Previous screen"
        size="sm"
        variant="secondary"
        disabled={currentPage === 1}
        onClick={() => goTo(currentPage - 1)}
      >
        <ChevronLeft />
      </IconButton>

      <div className="hidden items-center gap-1 sm:flex">
        {pageNumbers.map((page, index) => {
          const previous = pageNumbers[index - 1];
          const gap = previous !== undefined && page - previous > 1;
          return (
            <React.Fragment key={page}>
              {gap && (
                <span aria-hidden="true" className="px-1 text-ink-3">
                  …
                </span>
              )}
              <button
                type="button"
                onClick={() => goTo(page)}
                aria-current={currentPage === page ? "page" : undefined}
                className={cn(
                  "h-7 min-w-7 rounded-control border px-2 font-mono text-[13px] tabular transition-colors duration-120",
                  currentPage === page
                    ? "border-action bg-npb text-ink"
                    : "border-line bg-page text-ink-2 hover:border-ink-3 hover:text-ink",
                )}
              >
                {page}
              </button>
            </React.Fragment>
          );
        })}
      </div>

      <label className="flex items-center gap-1.5 px-1 text-xs text-ink-3">
        <span className="sr-only">Go to screen</span>
        <Input
          type="number"
          min={1}
          max={totalPages}
          inputSize="sm"
          mono
          value={pageInput}
          onChange={(event) => setPageInput(event.target.value)}
          onBlur={commitPageInput}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          className="no-spinner w-12 text-center"
          aria-label={`Go to screen, between 1 and ${totalPages}`}
        />
        <Mono>/ {totalPages}</Mono>
      </label>

      <IconButton
        label="Next screen"
        size="sm"
        variant="secondary"
        disabled={currentPage === totalPages}
        onClick={() => goTo(currentPage + 1)}
      >
        <ChevronRight />
      </IconButton>
      <IconButton
        label="Last screen"
        size="sm"
        variant="secondary"
        disabled={currentPage === totalPages}
        onClick={() => goTo(totalPages)}
      >
        <ChevronsRight />
      </IconButton>
    </nav>
  );
};

export default React.memo(EditorPagination);
