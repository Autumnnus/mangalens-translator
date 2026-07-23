import { Filter, Plus, Search, X } from "lucide-react";
import React from "react";

interface SidebarActionsProps {
  onAdd: () => void;
  onOpenFilter: () => void;
  search: string;
  onSearchChange: (search: string) => void;
  activeFilterCount: number;
  onClearFilters: () => void;
  isSidebarCollapsed: boolean;
  isViewOnly?: boolean;
}

const SidebarActions: React.FC<SidebarActionsProps> = ({
  onAdd,
  onOpenFilter,
  search,
  onSearchChange,
  activeFilterCount,
  onClearFilters,
  isSidebarCollapsed,
  isViewOnly = false,
}) => {
  return (
    <div
      className={`${isSidebarCollapsed ? "px-2" : "px-4"} py-3 space-y-2 border-b border-border-muted bg-surface/30`}
    >
      {!isViewOnly && (
        <button
          onClick={onAdd}
          title="New Series"
          className={`w-full bg-primary hover:bg-primary-hover text-white ${isSidebarCollapsed ? "px-2" : "px-4"} py-2.5 rounded-xl font-black text-xs uppercase flex items-center justify-center gap-2 transition-all shadow-lg shadow-primary/25 hover:scale-[1.02] active:scale-[0.98]`}
        >
          <Plus className="w-4 h-4" />
          {!isSidebarCollapsed && "New Series"}
        </button>
      )}
      {!isSidebarCollapsed && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-dark" />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search series…"
            className="w-full rounded-xl border border-border-muted bg-surface-raised/70 py-2.5 pl-9 pr-9 text-xs font-semibold text-text-main outline-none transition-all placeholder:text-text-dark focus:border-primary/60 focus:ring-1 focus:ring-primary/40"
            aria-label="Search series"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-lg text-text-dark transition-colors hover:bg-surface-elevated hover:text-text-main"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
      <button
        onClick={onOpenFilter}
        title="Filter and sort series"
        className={`relative w-full bg-surface-raised hover:bg-surface-elevated text-text-muted hover:text-text-main ${isSidebarCollapsed ? "px-2" : "px-3"} py-2 rounded-xl font-black text-xs uppercase flex items-center justify-center gap-2 transition-all border border-border-muted`}
      >
        <Filter className="w-3.5 h-3.5" />
        {!isSidebarCollapsed && "Filter & Sort"}
        {activeFilterCount > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[8px] font-black text-white">
            {activeFilterCount}
          </span>
        )}
      </button>
      {!isSidebarCollapsed && activeFilterCount > 0 && (
        <button
          type="button"
          onClick={onClearFilters}
          className="w-full py-1 text-[9px] font-black uppercase tracking-wider text-text-dark transition-colors hover:text-text-main"
        >
          Clear filters
        </button>
      )}
    </div>
  );
};

export default React.memo(SidebarActions);
