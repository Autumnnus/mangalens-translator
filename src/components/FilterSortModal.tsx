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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div
        className="bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          <h3 className="text-xl font-black uppercase tracking-tight">
            Filter & Sort
          </h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Search */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2 block">
              Search
            </label>
            <input
              type="text"
              value={filters.search}
              onChange={(e) =>
                setFilters({ ...filters, search: e.target.value })
              }
              placeholder="Series name..."
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 ring-indigo-500 outline-none"
            />
          </div>

          {/* Categories */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2 block">
              Categories
            </label>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {availableCategories.map((cat) => (
                <label
                  key={cat}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-800 cursor-pointer transition-colors"
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
                            (c) => c !== cat
                          ),
                        });
                      }
                    }}
                    className="w-4 h-4 rounded border-slate-600 accent-indigo-600"
                  />
                  <span className="text-sm font-bold">{cat}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Sort By */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2 block">
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
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 ring-indigo-500 outline-none"
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
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2 block">
              Status
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-800 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={filters.showCompleted}
                  onChange={(e) =>
                    setFilters({ ...filters, showCompleted: e.target.checked })
                  }
                  className="w-4 h-4 rounded border-slate-600 accent-indigo-600"
                />
                <span className="text-sm font-bold">Show Completed</span>
              </label>
              <label className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-800 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={filters.showInProgress}
                  onChange={(e) =>
                    setFilters({ ...filters, showInProgress: e.target.checked })
                  }
                  className="w-4 h-4 rounded border-slate-600 accent-indigo-600"
                />
                <span className="text-sm font-bold">Show In Progress</span>
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 p-6 border-t border-slate-800">
          <button
            onClick={handleReset}
            className="flex-1 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-black text-xs uppercase transition-all"
          >
            Reset
          </button>
          <button
            onClick={handleApply}
            className="flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black text-xs uppercase transition-all shadow-lg shadow-indigo-500/20"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};

export default FilterSortModal;
