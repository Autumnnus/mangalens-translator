import { Download, Filter, Hash, Menu, Plus, Trash2, X } from "lucide-react";
import React, { useMemo, useState } from "react";
import { ProcessedImage, Series } from "../types";
import FilterSortModal, { FilterSortOptions } from "./FilterSortModal";

interface Props {
  series: Series[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
  onExportAll: () => void;
  isOpen: boolean;
  onClose: () => void;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isViewOnly?: boolean;
  categories: string[];
  page: number;
  pageSize: number;
  total: number;
  setPage: (p: number) => void;
}

const SeriesIcon = ({ images }: { images: ProcessedImage[] }) => {
  const [isExpanded, setIsExpanded] = React.useState(false);
  if (images.length === 0) {
    return (
      <div className="w-10 h-10 flex items-center justify-center bg-slate-800 rounded-lg border border-slate-700">
        <Hash className="w-4 h-4 text-slate-500" />
      </div>
    );
  }

  const getIndices = () => {
    if (images.length === 1) return [0];
    if (images.length === 2) return [0, 1];

    const first = 0;
    const last = images.length - 1;
    const middle = Math.floor(images.length / 2);

    return [first, middle, last];
  };

  const indices = getIndices();

  if (isExpanded) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        onClick={(e) => {
          e.stopPropagation();
          setIsExpanded(false);
        }}
      >
        <div
          className="bg-slate-900 border border-slate-700 rounded-2xl p-4 max-w-sm w-full shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="grid grid-cols-3 gap-2">
            {images.map((img, idx) => (
              <div
                key={idx}
                className="aspect-[3/4] overflow-hidden rounded-lg border border-slate-700"
              >
                <img
                  src={img.translatedUrl || img.originalUrl}
                  className="w-full h-full object-cover"
                  alt=""
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative w-10 h-10 cursor-pointer"
      onClick={(e) => {
        e.stopPropagation();
        setIsExpanded(true);
      }}
    >
      {indices.map((idx, i) => (
        <div
          key={idx + "-" + i}
          className="absolute w-7 h-7 border border-slate-700 rounded-md overflow-hidden bg-slate-800 shadow-lg"
          style={{
            top: `${i * 3}px`,
            left: `${i * 3}px`,
            zIndex: i,
            transform: `rotate(${i * 4 - 4}deg)`,
          }}
        >
          <img
            src={images[idx].translatedUrl || images[idx].originalUrl}
            className="w-full h-full object-cover"
            alt=""
          />
        </div>
      ))}
    </div>
  );
};

const SeriesSidebar: React.FC<Props> = ({
  series,
  activeId,
  onSelect,
  onAdd,
  onDelete,
  onExportAll,
  isOpen,
  onClose,
  onImport,
  onEdit,
  isViewOnly = false,
  categories,
  page,
  pageSize,
  total,
  setPage,
}) => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    new Set()
  );
  const [filters, setFilters] = useState<FilterSortOptions>({
    search: "",
    categories: [],
    sortBy: "newest",
    showCompleted: true,
    showInProgress: true,
  });

  const toggleCategory = (category: string) => {
    setCollapsedCategories((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(category)) {
        newSet.delete(category);
      } else {
        newSet.add(category);
      }
      return newSet;
    });
  };

  // Filter and sort series
  const filteredAndSortedSeries = useMemo(() => {
    let result = [...series];

    // Apply search
    if (filters.search) {
      result = result.filter((s) =>
        s.name.toLowerCase().includes(filters.search.toLowerCase())
      );
    }

    // Apply category filter
    if (filters.categories.length > 0) {
      result = result.filter((s) => filters.categories.includes(s.category));
    }

    // Apply status filter
    result = result.filter((s) => {
      const isCompleted = s.images.every((img) => img.status === "completed");
      const isInProgress = s.images.some(
        (img) => img.status !== "idle" && img.status !== "completed"
      );

      if (!filters.showCompleted && isCompleted) return false;
      if (!filters.showInProgress && isInProgress) return false;
      return true;
    });

    // Apply sorting
    switch (filters.sortBy) {
      case "name-asc":
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "name-desc":
        result.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case "newest":
        result.sort((a, b) => b.createdAt - a.createdAt);
        break;
      case "oldest":
        result.sort((a, b) => a.createdAt - b.createdAt);
        break;
      case "most-images":
        result.sort((a, b) => b.images.length - a.images.length);
        break;
      case "least-images":
        result.sort((a, b) => a.images.length - b.images.length);
        break;
    }

    return result;
  }, [series, filters]);

  // Group by category
  const groupedSeries: Record<string, Series[]> = useMemo(() => {
    const groups: Record<string, Series[]> = {};
    filteredAndSortedSeries.forEach((s) => {
      if (!groups[s.category]) {
        groups[s.category] = [];
      }
      groups[s.category].push(s);
    });
    return groups;
  }, [filteredAndSortedSeries]);

  const sidebarContent = (
    <>
      {/* Header */}
      <div
        className={`p-6 flex items-center ${
          isSidebarCollapsed ? "justify-center" : "justify-between"
        } border-b border-slate-800`}
      >
        {!isSidebarCollapsed && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-tr from-indigo-600 to-fuchsia-600 rounded-lg flex items-center justify-center">
              <i className="fas fa-eye-low-vision text-sm"></i>
            </div>
            <h5 className="text-xl font-black tracking-tighter uppercase leading-none italic">
              Manga<span className="text-indigo-400">Lens</span>
            </h5>
          </div>
        )}
        <button
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-colors md:flex hidden"
        >
          <i
            className={`fas fa-chevron-${
              isSidebarCollapsed ? "right" : "left"
            } text-xs`}
          ></i>
        </button>
        <button
          onClick={() => setIsMobileOpen(false)}
          className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-colors md:hidden"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Action Buttons */}
      {!isViewOnly && !isSidebarCollapsed && (
        <div className="px-4 py-2 space-y-2 border-b border-slate-800">
          <button
            onClick={onAdd}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-xl font-black text-xs uppercase flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-500/20"
          >
            <Plus className="w-4 h-4" />
            New Series
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => setIsFilterModalOpen(true)}
              className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-xl font-black text-xs uppercase flex items-center justify-center gap-2 transition-all border border-slate-700"
            >
              <Filter className="w-3.5 h-3.5" />
              Filter
            </button>
            <label className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-xl font-black text-xs uppercase flex items-center justify-center gap-2 transition-all border border-slate-700 cursor-pointer">
              <input
                type="file"
                accept=".zip"
                className="hidden"
                onChange={(e) => {
                  onImport(e);
                  setIsMobileOpen(false);
                }}
              />
              <Download className="w-3.5 h-3.5" />
              Import
            </label>
          </div>
        </div>
      )}

      {/* Series List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {Object.keys(groupedSeries).length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-sm">
            No series found
          </div>
        ) : (
          Object.entries(groupedSeries).map(([category, categorySeries]) => (
            <div key={category} className="border-b border-slate-800/50">
              {/* Category Header */}
              <button
                onClick={() => toggleCategory(category)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-800/30 transition-colors group"
              >
                <div className="flex items-center gap-2">
                  <i
                    className={`fas fa-chevron-${
                      collapsedCategories.has(category) ? "right" : "down"
                    } text-[10px] text-slate-500 transition-transform`}
                  ></i>
                  {!isSidebarCollapsed && (
                    <>
                      <span className="text-xs font-black uppercase tracking-wider text-slate-400">
                        {category}
                      </span>
                      <span className="text-[10px] font-bold text-slate-600 bg-slate-800 px-2 py-0.5 rounded-full">
                        {categorySeries?.length}
                      </span>
                    </>
                  )}
                </div>
              </button>

              {/* Series in Category */}
              {!collapsedCategories.has(category) && (
                <div className="space-y-1 px-2 pb-2">
                  {categorySeries?.map((s) => (
                    <div
                      key={s.id}
                      onClick={() => {
                        onSelect(s.id);
                        setIsMobileOpen(false);
                      }}
                      className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all cursor-pointer ${
                        activeId === s.id
                          ? "bg-indigo-600/20 border border-indigo-500/50"
                          : "hover:bg-slate-800/50 border border-transparent"
                      }`}
                    >
                      <SeriesIcon images={s.images} />
                      {!isSidebarCollapsed && (
                        <>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold truncate">
                              {s.name}
                            </p>
                            <p className="text-[10px] text-slate-500 font-bold">
                              {s.images.length} pages
                            </p>
                          </div>
                          {!isViewOnly && (
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onEdit(s.id);
                                }}
                                className="w-7 h-7 bg-slate-800 hover:bg-indigo-600 rounded-lg flex items-center justify-center transition-colors"
                              >
                                <i className="fas fa-edit text-[10px]"></i>
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDelete(s.id);
                                }}
                                className="w-7 h-7 bg-slate-800 hover:bg-red-600 rounded-lg flex items-center justify-center transition-colors"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      {!isSidebarCollapsed && (
        <div className="p-4 border-t border-slate-800 space-y-2">
          {/* Pagination */}
          <div className="flex items-center justify-between mb-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="p-2 bg-slate-800 rounded-lg text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:text-slate-400 transition-colors"
            >
              <i className="fas fa-chevron-left text-xs"></i>
            </button>
            <span className="text-[10px] font-bold text-slate-500 uppercase">
              Page {page} of {Math.ceil(total / pageSize) || 1}
            </span>
            <button
              disabled={page >= Math.ceil(total / pageSize)}
              onClick={() => setPage(page + 1)}
              className="p-2 bg-slate-800 rounded-lg text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:text-slate-400 transition-colors"
            >
              <i className="fas fa-chevron-right text-xs"></i>
            </button>
          </div>

          <button
            onClick={onExportAll}
            className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2.5 rounded-xl font-black text-xs uppercase flex items-center justify-center gap-2 transition-all border border-slate-700"
          >
            <Download className="w-4 h-4" />
            Export All
          </button>
        </div>
      )}
    </>
  );

  return (
    <>
      {/* Mobile Hamburger Button */}
      <button
        onClick={() => setIsMobileOpen(true)}
        className="fixed top-4 left-4 z-[60] w-12 h-12 bg-slate-900 border border-slate-700 rounded-2xl flex items-center justify-center md:hidden shadow-2xl"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          ${isSidebarCollapsed ? "w-20" : "w-72"} 
          bg-[#0a0f1a] border-r border-slate-800 
          flex flex-col h-screen overflow-hidden
          transition-all duration-300
          fixed md:relative inset-y-0 left-0 z-[80]
          ${
            isMobileOpen
              ? "translate-x-0"
              : "-translate-x-full md:translate-x-0"
          }
        `}
      >
        {sidebarContent}
      </aside>

      {/* Filter Modal */}
      <FilterSortModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        availableCategories={categories}
        currentFilters={filters}
        onApply={setFilters}
      />
    </>
  );
};

export default SeriesSidebar;
