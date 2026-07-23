import React, { useEffect, useMemo, useState } from "react";

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

  const handlePageClick = (page: number) => {
    onPageChange(Math.min(Math.max(page, 1), totalPages));
  };

  const commitPageInput = () => {
    const page = Number.parseInt(pageInput, 10);
    if (Number.isNaN(page)) {
      setPageInput(String(currentPage));
      return;
    }
    handlePageClick(page);
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

  const isTop = placement === "top";

  const pageButtons = pageNumbers.flatMap((page, index) => {
    const previousPage = pageNumbers[index - 1];
    const needsEllipsis = previousPage !== undefined && page - previousPage > 1;
    const items: React.ReactNode[] = [];

    if (needsEllipsis) {
      items.push(
        <span
          key={`ellipsis-${previousPage}-${page}`}
          className="px-1 text-xs font-bold text-text-dark"
        >
          …
        </span>,
      );
    }

    items.push(
      <button
        key={page}
        type="button"
        onClick={() => handlePageClick(page)}
        aria-current={currentPage === page ? "page" : undefined}
        className={`h-10 min-w-10 rounded-xl border px-3 text-xs font-black transition-all ${
          currentPage === page
            ? "border-primary bg-primary text-white shadow-glow"
            : "border-border-muted bg-surface-raised/70 text-text-muted hover:border-primary/50 hover:text-text-main"
        }`}
      >
        {page}
      </button>,
    );

    return items;
  });

  return (
    <nav
      aria-label="Editor page navigation"
      className={`flex flex-col items-center justify-center gap-3 border-border-muted/70 py-5 sm:flex-row sm:gap-4 ${
        isTop ? "mb-6 border-y" : "mt-12 border-t pt-12"
      }`}
    >
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={currentPage === 1}
          onClick={() => handlePageClick(1)}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-border-muted bg-surface-raised/70 text-text-muted transition-all hover:border-primary/50 hover:text-text-main disabled:cursor-not-allowed disabled:opacity-30"
          title="First page"
          aria-label="First page"
        >
          <i className="fas fa-angle-double-left text-xs" />
        </button>
        <button
          type="button"
          disabled={currentPage === 1}
          onClick={() => handlePageClick(currentPage - 1)}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-border-muted bg-surface-raised/70 text-text-muted transition-all hover:border-primary/50 hover:text-text-main disabled:cursor-not-allowed disabled:opacity-30"
          title="Previous page"
          aria-label="Previous page"
        >
          <i className="fas fa-chevron-left text-xs" />
        </button>
      </div>

      <div className="hidden items-center gap-1.5 sm:flex">{pageButtons}</div>

      <label className="flex items-center gap-2 rounded-xl border border-border-muted bg-surface-raised/70 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-text-muted">
        <span className="hidden sm:inline">Page</span>
        <input
          type="number"
          min={1}
          max={totalPages}
          value={pageInput}
          onChange={(event) => setPageInput(event.target.value)}
          onBlur={commitPageInput}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
          className="w-9 bg-transparent text-center text-xs font-black text-text-main outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          aria-label={`Go to page, between 1 and ${totalPages}`}
        />
        <span className="text-text-dark">/ {totalPages}</span>
      </label>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={currentPage === totalPages}
          onClick={() => handlePageClick(currentPage + 1)}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-border-muted bg-surface-raised/70 text-text-muted transition-all hover:border-primary/50 hover:text-text-main disabled:cursor-not-allowed disabled:opacity-30"
          title="Next page"
          aria-label="Next page"
        >
          <i className="fas fa-chevron-right text-xs" />
        </button>
        <button
          type="button"
          disabled={currentPage === totalPages}
          onClick={() => handlePageClick(totalPages)}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-border-muted bg-surface-raised/70 text-text-muted transition-all hover:border-primary/50 hover:text-text-main disabled:cursor-not-allowed disabled:opacity-30"
          title="Last page"
          aria-label="Last page"
        >
          <i className="fas fa-angle-double-right text-xs" />
        </button>
      </div>
    </nav>
  );
};

export default React.memo(EditorPagination);
