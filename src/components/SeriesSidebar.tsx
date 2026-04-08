import { Menu } from "lucide-react";
import React, { useCallback, useMemo, useState } from "react";
import { Category, Series } from "../types";
import FilterSortModal, { FilterSortOptions } from "./FilterSortModal";
import CategoryNode from "./sidebar/CategoryNode";
import SidebarActions from "./sidebar/SidebarActions";
import SidebarFooter from "./sidebar/SidebarFooter";
import SidebarHeader from "./sidebar/SidebarHeader";
import SystemActions from "./sidebar/SystemActions";
import UncategorizedSection from "./sidebar/UncategorizedSection";

interface Props {
  series: Series[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
  isViewOnly?: boolean;
  categories: Category[];
  onMoveSeries?: (seriesId: string, categoryId: string) => void;
  onMoveCategory?: (
    categoryId: string,
    targetParentId: string | undefined,
  ) => void;
  onAddSubcategory?: (parentId: string) => void;
  onMoveSeriesUpDown?: (id: string, direction: "up" | "down") => void;
  isLoading?: boolean;
}

const SeriesSidebar: React.FC<Props> = ({
  series,
  activeId,
  onSelect,
  onAdd,
  onDelete,
  onEdit,
  isViewOnly = false,
  categories,
  onMoveSeries,
  onMoveCategory,
  onAddSubcategory,
  onMoveSeriesUpDown,
  isLoading = false,
}) => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    new Set(),
  );
  const [filters, setFilters] = useState<FilterSortOptions>({
    search: "",
    categories: [],
    sortBy: "sequence",
    showCompleted: true,
    showInProgress: true,
  });

  const toggleCategory = useCallback((categoryId: string) => {
    setCollapsedCategories((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId);
      } else {
        newSet.add(categoryId);
      }
      return newSet;
    });
  }, []);

  const filteredAndSortedSeries = useMemo(() => {
    let result = [...series];

    if (filters.search) {
      result = result.filter((s) =>
        s.name.toLowerCase().includes(filters.search.toLowerCase()),
      );
    }

    if (filters.categories.length > 0) {
      result = result.filter((s) => filters.categories.includes(s.category));
    }

    result = result.filter((s) => {
      const totalImgs = s.imageCount || 0;
      const compImgs = s.completedCount || 0;

      const isCompleted = totalImgs > 0 && totalImgs === compImgs;
      const isInProgress = totalImgs > 0 && compImgs < totalImgs;

      if (!filters.showCompleted && isCompleted) return false;
      if (!filters.showInProgress && isInProgress) return false;
      return true;
    });

    switch (filters.sortBy) {
      case "sequence":
        result.sort(
          (a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0),
        );
        break;
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
        result.sort((a, b) => (b.imageCount || 0) - (a.imageCount || 0));
        break;
      case "least-images":
        result.sort((a, b) => (a.imageCount || 0) - (b.imageCount || 0));
        break;
    }

    return result;
  }, [series, filters]);

  const rootCategories = useMemo(() => {
    const categoryIds = new Set(categories.map((c) => c.id));
    return categories.filter(
      (c) => !c.parentId || !categoryIds.has(c.parentId),
    );
  }, [categories]);

  const uncategorizedSeries = useMemo(() => {
    const categoryIds = new Set(categories.map((c) => c.id));
    return filteredAndSortedSeries.filter(
      (s) => !s.categoryId || !categoryIds.has(s.categoryId),
    );
  }, [categories, filteredAndSortedSeries]);

  const handleAddSubcategory = useCallback(
    (parentId: string) => {
      if (onAddSubcategory) onAddSubcategory(parentId);
    },
    [onAddSubcategory],
  );

  const sidebarContent = (
    <>
      <SidebarHeader
        isSidebarCollapsed={isSidebarCollapsed}
        setIsSidebarCollapsed={setIsSidebarCollapsed}
        setIsMobileOpen={setIsMobileOpen}
      />

      <SidebarActions
        onAdd={onAdd}
        onOpenFilter={() => setIsFilterModalOpen(true)}
        isViewOnly={isViewOnly}
      />

      <SystemActions isViewOnly={isViewOnly} />

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {isLoading ? (
          <div className="p-4 space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="space-y-2 animate-pulse">
                <div className="h-4 bg-surface-muted rounded-md w-24 mb-3" />
                <div className="space-y-2">
                  <div className="h-10 bg-surface-muted/50 rounded-xl w-full" />
                  <div className="h-10 bg-surface-muted/50 rounded-xl w-[90%] ml-auto" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredAndSortedSeries.length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-sm">
            No series found
          </div>
        ) : (
          <>
            <UncategorizedSection
              uncategorizedSeries={uncategorizedSeries}
              collapsedCategories={collapsedCategories}
              toggleCategory={toggleCategory}
              activeId={activeId}
              onSelect={onSelect}
              setIsMobileOpen={setIsMobileOpen}
              isSidebarCollapsed={isSidebarCollapsed}
              isViewOnly={isViewOnly}
              onEdit={onEdit}
              onDelete={onDelete}
              onMoveSeries={onMoveSeries}
              onMoveCategory={onMoveCategory}
              onMoveSeriesUpDown={onMoveSeriesUpDown}
            />

            {rootCategories.map((cat) => (
              <CategoryNode
                key={cat.id}
                category={cat}
                allCategories={categories}
                series={filteredAndSortedSeries}
                depth={0}
                collapsedCategories={collapsedCategories}
                toggleCategory={toggleCategory}
                activeId={activeId}
                onSelect={onSelect}
                closeMobileSidebar={() => setIsMobileOpen(false)}
                isSidebarCollapsed={isSidebarCollapsed}
                isViewOnly={isViewOnly}
                onEdit={onEdit}
                onDelete={onDelete}
                onMoveSeries={onMoveSeries}
                onMoveCategory={onMoveCategory}
                onAddSubcategory={handleAddSubcategory}
                onMoveSeriesUpDown={onMoveSeriesUpDown}
              />
            ))}
          </>
        )}
      </div>

      <SidebarFooter
        isSidebarCollapsed={isSidebarCollapsed}
        isViewOnly={isViewOnly}
      />
    </>
  );

  return (
    <>
      <button
        onClick={() => setIsMobileOpen(true)}
        className="fixed top-4 left-4 z-[150] w-12 h-12 bg-slate-900 border border-slate-700 rounded-2xl flex items-center justify-center md:hidden shadow-2xl"
      >
        <Menu className="w-5 h-5" />
      </button>

      {isMobileOpen && (
        <div
          className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      <aside
        className={`
          ${isSidebarCollapsed ? "w-20" : "w-72"} 
          bg-surface border-r border-border-muted 
          flex flex-col h-screen overflow-hidden
          transition-all duration-300 ease-in-out
          fixed md:relative inset-y-0 left-0 z-[80]
          ${isMobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
      >
        {sidebarContent}
      </aside>

      <FilterSortModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        availableCategories={categories.map((c) => c.name)}
        currentFilters={filters}
        onApply={setFilters}
      />
    </>
  );
};

export default React.memo(SeriesSidebar);
