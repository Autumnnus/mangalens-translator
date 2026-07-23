import React from "react";
import { ProcessedImage } from "../../types";

interface EditorBulkActionsProps {
  selectedCount: number;
  totalCount: number;
  isPageSelected: boolean;
  isBusy?: boolean;
  onTogglePage: () => void;
  onSelectAll: () => void;
  onClear: () => void;
  onStatusChange: (status: ProcessedImage["status"]) => void;
  onTranslate: () => void;
  onDelete: () => void;
}

const EditorBulkActions: React.FC<EditorBulkActionsProps> = ({
  selectedCount,
  totalCount,
  isPageSelected,
  isBusy = false,
  onTogglePage,
  onSelectAll,
  onClear,
  onStatusChange,
  onTranslate,
  onDelete,
}) => {
  const hasSelection = selectedCount > 0;

  return (
    <section
      aria-label="Bulk page actions"
      className="sticky top-3 z-30 mb-8 rounded-2xl border border-border-muted bg-surface/95 p-3 shadow-premium backdrop-blur-xl"
    >
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onTogglePage}
            className={`rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-wider transition-all ${
              isPageSelected
                ? "border-primary bg-primary text-white shadow-glow"
                : "border-border-muted bg-surface-raised/70 text-text-muted hover:border-primary/50 hover:text-text-main"
            }`}
          >
            <i className={`fas ${isPageSelected ? "fa-check-square" : "fa-square"} mr-2`} />
            {isPageSelected ? "Unselect page" : "Select page"}
          </button>
          <button
            type="button"
            onClick={onSelectAll}
            disabled={selectedCount === totalCount}
            className="rounded-xl border border-border-muted bg-surface-raised/70 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-text-muted transition-all hover:border-primary/50 hover:text-text-main disabled:cursor-not-allowed disabled:opacity-40"
          >
            Select all ({totalCount})
          </button>
          {hasSelection && (
            <button
              type="button"
              onClick={onClear}
              className="px-2 py-2 text-[10px] font-black uppercase tracking-wider text-text-dark transition-colors hover:text-text-main"
            >
              Clear
            </button>
          )}
          <span className="ml-1 rounded-lg bg-primary/10 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-primary">
            {selectedCount} selected
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="bulk-status">
            Set status for selected pages
          </label>
          <select
            id="bulk-status"
            defaultValue=""
            disabled={!hasSelection || isBusy}
            onChange={(event) => {
              const status = event.target.value as ProcessedImage["status"] | "";
              if (!status) return;
              onStatusChange(status);
              event.currentTarget.value = "";
            }}
            className="rounded-xl border border-border-muted bg-surface-raised/70 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-text-muted outline-none transition-colors hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <option value="">Set status…</option>
            <option value="idle">Mark idle</option>
            <option value="completed">Mark completed</option>
            <option value="error">Mark error</option>
          </select>
          <button
            type="button"
            onClick={onTranslate}
            disabled={!hasSelection || isBusy}
            className="rounded-xl border border-primary/30 bg-primary/15 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-primary transition-all hover:bg-primary hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <i className="fas fa-bolt mr-2" />Translate selected
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={!hasSelection || isBusy}
            className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-red-400 transition-all hover:bg-red-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <i className="fas fa-trash-alt mr-2" />Delete selected
          </button>
        </div>
      </div>
    </section>
  );
};

export default React.memo(EditorBulkActions);
