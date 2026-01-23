import { X } from "lucide-react";
import React, { useState } from "react";

export interface FilterSortOptions {
  search: string;
  categories: string[];
  sortBy:
    | "name-asc"
    | "name-desc"
    | "newest"
    | "oldest"
    | "most-images"
    | "least-images";
  showCompleted: boolean;
  showInProgress: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  availableCategories: string[];
  currentFilters: FilterSortOptions;
  onApply: (filters: FilterSortOptions) => void;
}

const FilterSortModal: React.FC<Props> = ({
  isOpen,
  onClose,
  availableCategories,
  currentFilters,
  onApply,
}) => {
  const [filters, setFilters] = useState<FilterSortOptions>(currentFilters);

  const handleApply = () => {
    onApply(filters);
    onClose();
  };

  const handleReset = () => {
    const resetFilters: FilterSortOptions = {
      search: "",
      categories: [],
      sortBy: "newest",
      showCompleted: true,
      showInProgress: true,
    };
    setFilters(resetFilters);
    onApply(resetFilters);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md p-4">
      <div
        className="bg-surface/40 backdrop-blur-2xl border border-border-muted rounded-[2.5rem] shadow-glow w-full max-w-md animate-in zoom-in-95 duration-200 glass-card overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-8 border-b border-border-muted">
          <h3 className="text-2xl font-black text-text-main uppercase tracking-tighter text-glow">
            Filter & Sort
          </h3>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-surface-raised hover:bg-surface-elevated flex items-center justify-center transition-all border border-border-muted hover:border-border-accent group"
          >
            <X className="w-5 h-5 text-text-muted group-hover:text-text-main transition-colors" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Search */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-text-dark mb-2.5 block ml-1">
              Search
            </label>
            <input
              type="text"
              value={filters.search}
              onChange={(e) =>
                setFilters({ ...filters, search: e.target.value })
              }
              placeholder="Series name..."
              className="w-full bg-surface-raised border border-border-muted rounded-2xl px-5 py-3 text-sm focus:ring-2 ring-primary outline-none transition-all placeholder:text-text-dark/50"
            />
          </div>

          {/* Categories */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-text-dark mb-2.5 block ml-1">
              Categories
            </label>
            <div className="space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar pr-2">
              {availableCategories.map((cat) => (
                <label
                  key={cat}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-surface-raised cursor-pointer transition-all border border-transparent hover:border-border-muted group"
                >
                  <input
                    type="checkbox"
                    checked={filters.categories.includes(cat)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFilters({
                          ...filters,
                          categories: [...filters.categories, cat],
                        });
                      } else {
                        setFilters({
                          ...filters,
                          categories: filters.categories.filter(
                            (c) => c !== cat,
                          ),
                        });
                      }
                    }}
                    className="w-4 h-4 rounded border-border-muted accent-primary cursor-pointer"
                  />
                  <span className="text-sm font-bold text-text-muted group-hover:text-text-main transition-colors">
                    {cat}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Sort By */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-text-dark mb-2.5 block ml-1">
              Sort By
            </label>
            <select
              value={filters.sortBy}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  sortBy: e.target.value as FilterSortOptions["sortBy"],
                })
              }
              className="w-full bg-surface-raised border border-border-muted rounded-2xl px-5 py-3 text-sm font-bold focus:ring-2 ring-primary outline-none transition-all appearance-none cursor-pointer"
            >
              <option value="name-asc">Name (A-Z)</option>
              <option value="name-desc">Name (Z-A)</option>
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="most-images">Most Images</option>
              <option value="least-images">Least Images</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-text-dark mb-2.5 block ml-1">
              Status
            </label>
            <div className="space-y-1.5">
              <label className="flex items-center gap-3 p-3 rounded-xl hover:bg-surface-raised cursor-pointer transition-all border border-transparent hover:border-border-muted group">
                <input
                  type="checkbox"
                  checked={filters.showCompleted}
                  onChange={(e) =>
                    setFilters({ ...filters, showCompleted: e.target.checked })
                  }
                  className="w-4 h-4 rounded border-border-muted accent-primary cursor-pointer"
                />
                <span className="text-sm font-bold text-text-muted group-hover:text-text-main transition-colors">
                  Show Completed
                </span>
              </label>
              <label className="flex items-center gap-3 p-3 rounded-xl hover:bg-surface-raised cursor-pointer transition-all border border-transparent hover:border-border-muted group">
                <input
                  type="checkbox"
                  checked={filters.showInProgress}
                  onChange={(e) =>
                    setFilters({ ...filters, showInProgress: e.target.checked })
                  }
                  className="w-4 h-4 rounded border-border-muted accent-primary cursor-pointer"
                />
                <span className="text-sm font-bold text-text-muted group-hover:text-text-main transition-colors">
                  Show In Progress
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 p-8 border-t border-border-muted bg-surface/20">
          <button
            onClick={handleReset}
            className="flex-1 py-3.5 px-4 bg-surface-raised hover:bg-surface-elevated text-text-muted rounded-2xl font-black text-xs uppercase tracking-widest transition-all border border-border-muted hover:border-border-accent active:scale-[0.98]"
          >
            Reset
          </button>
          <button
            onClick={handleApply}
            className="flex-1 py-3.5 px-4 bg-primary hover:bg-primary-hover text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-primary/20 border border-primary/20 active:scale-[0.98]"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};

export default FilterSortModal;
