import { FolderOpen, Plus, X } from "lucide-react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { useUIStore } from "../stores/useUIStore";
import { Category, Series } from "../types";
import { cn } from "../utils/cn";
import FilterSortModal, { FilterSortOptions } from "./FilterSortModal";
import CategoryNode from "./sidebar/CategoryNode";
import QueuePanel from "./sidebar/QueuePanel";
import SidebarActions from "./sidebar/SidebarActions";
import SidebarFooter from "./sidebar/SidebarFooter";
import SidebarHeader from "./sidebar/SidebarHeader";
import UncategorizedSection from "./sidebar/UncategorizedSection";
import { Button, EmptyState, Skeleton } from "./ui";

const COLLAPSED_STORAGE_KEY = "mangalens_sidebar_collapsed";

/* Collapsed state lives in localStorage; a tiny external store keeps server
   and client markup identical and avoids setState inside an effect. */
let collapsedInMemory: boolean | null = null;
const collapsedListeners = new Set<() => void>();

const readCollapsed = (): boolean => {
  if (collapsedInMemory !== null) return collapsedInMemory;
  try {
    return window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

const subscribeCollapsed = (callback: () => void) => {
  collapsedListeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    collapsedListeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
};

const writeCollapsed = (value: boolean) => {
  collapsedInMemory = value;
  try {
    window.localStorage.setItem(COLLAPSED_STORAGE_KEY, value ? "1" : "0");
  } catch {
    // Storage unavailable; the in-memory value still applies for this session.
  }
  collapsedListeners.forEach((callback) => callback());
};

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

const DEFAULT_FILTERS: FilterSortOptions = {
  search: "",
  categories: [],
  sortBy: "sequence",
  showCompleted: true,
  showInProgress: true,
};

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
  const isSidebarOpen = useUIStore((state) => state.isSidebarOpen);
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);

  const isSidebarCollapsed = useSyncExternalStore(
    subscribeCollapsed,
    readCollapsed,
    () => false,
  );
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    new Set(),
  );
  const [filters, setFilters] = useState<FilterSortOptions>(DEFAULT_FILTERS);

  const setIsSidebarCollapsed = useCallback(
    (value: boolean) => {
      writeCollapsed(value);
      toggleSidebar(false);
    },
    [toggleSidebar],
  );

  const closeMobileSidebar = useCallback(() => toggleSidebar(false), [toggleSidebar]);

  // Escape closes the off-canvas sidebar.
  useEffect(() => {
    if (!isSidebarOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") toggleSidebar(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isSidebarOpen, toggleSidebar]);

  // The off-canvas drawer is always shown expanded.
  const collapsed = isSidebarCollapsed && !isSidebarOpen;

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

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
      result = result.filter(
        (s) => !!s.categoryId && filters.categories.includes(s.categoryId),
      );
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

  const hasNarrowingFilter =
    Boolean(filters.search.trim()) ||
    filters.categories.length > 0 ||
    !filters.showCompleted ||
    !filters.showInProgress;

  const visibleRootCategories = useMemo(() => {
    if (!hasNarrowingFilter) return rootCategories;

    const containsVisibleSeries = (categoryId: string): boolean => {
      if (filteredAndSortedSeries.some((series) => series.categoryId === categoryId)) {
        return true;
      }
      return categories
        .filter((category) => category.parentId === categoryId)
        .some((child) => containsVisibleSeries(child.id));
    };

    return rootCategories.filter((category) => containsVisibleSeries(category.id));
  }, [categories, filteredAndSortedSeries, hasNarrowingFilter, rootCategories]);

  const activeFilterCount =
    (filters.search.trim() ? 1 : 0) +
    filters.categories.length +
    (filters.sortBy !== "sequence" ? 1 : 0) +
    (!filters.showCompleted ? 1 : 0) +
    (!filters.showInProgress ? 1 : 0);

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

  const renderList = () => {
    if (isLoading) {
      return (
        <div
          className={cn("flex flex-col gap-1 py-1", collapsed ? "items-center" : "px-1")}
          aria-busy="true"
          aria-label="Loading series"
        >
          {Array.from({ length: 6 }).map((_, i) =>
            collapsed ? (
              <Skeleton key={i} className="h-9 w-9" />
            ) : (
              <div key={i} className="flex items-center gap-2 px-2 py-1.5">
                <Skeleton className="h-9 w-9 shrink-0" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-1 w-full rounded-full" />
                </div>
              </div>
            ),
          )}
        </div>
      );
    }

    if (filteredAndSortedSeries.length === 0) {
      if (collapsed) return null;
      return hasNarrowingFilter ? (
        <EmptyState
          className="m-2 px-3 py-8"
          textured={false}
          title="No series match"
          description="Try a different search or clear the filters."
          action={
            <Button variant="ghost" size="sm" icon={<X />} onClick={resetFilters}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <EmptyState
          className="m-2 px-3 py-8"
          textured={false}
          icon={<FolderOpen />}
          title="No series yet"
          description={
            isViewOnly
              ? "Nothing to read yet."
              : "Create a series and add pages to start translating."
          }
          action={
            !isViewOnly && (
              <Button variant="primary" size="sm" icon={<Plus />} onClick={onAdd}>
                New series
              </Button>
            )
          }
        />
      );
    }

    return (
      <div className="flex flex-col gap-0.5 py-1">
        <UncategorizedSection
          uncategorizedSeries={uncategorizedSeries}
          collapsedCategories={collapsedCategories}
          toggleCategory={toggleCategory}
          activeId={activeId}
          onSelect={onSelect}
          closeMobileSidebar={closeMobileSidebar}
          isSidebarCollapsed={collapsed}
          isViewOnly={isViewOnly}
          onEdit={onEdit}
          onDelete={onDelete}
          onMoveSeries={onMoveSeries}
          onMoveCategory={onMoveCategory}
          onMoveSeriesUpDown={onMoveSeriesUpDown}
          forceExpanded={hasNarrowingFilter}
        />

        {visibleRootCategories.map((cat) => (
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
            closeMobileSidebar={closeMobileSidebar}
            isSidebarCollapsed={collapsed}
            isViewOnly={isViewOnly}
            onEdit={onEdit}
            onDelete={onDelete}
            onMoveSeries={onMoveSeries}
            onMoveCategory={onMoveCategory}
            onAddSubcategory={handleAddSubcategory}
            onMoveSeriesUpDown={onMoveSeriesUpDown}
            forceExpanded={hasNarrowingFilter}
            hideEmptyCategories={hasNarrowingFilter}
          />
        ))}
      </div>
    );
  };

  return (
    <>
      {isSidebarOpen && (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-(--z-sidebar) bg-scrim animate-fade-in md:hidden"
          onClick={closeMobileSidebar}
        />
      )}

      <aside
        aria-label="Series"
        className={cn(
          "fixed inset-y-0 left-0 z-(--z-sidebar) flex h-dvh shrink-0 flex-col border-r border-line bg-page transition-[width] duration-200 ease-out md:relative",
          collapsed ? "w-14" : "w-[264px]",
          isSidebarOpen ? "animate-fade-in" : "max-md:hidden",
        )}
      >
        <SidebarHeader
          isSidebarCollapsed={collapsed}
          setIsSidebarCollapsed={setIsSidebarCollapsed}
          onCloseMobile={closeMobileSidebar}
        />

        <SidebarActions
          onAdd={onAdd}
          onOpenFilter={() => setIsFilterModalOpen(true)}
          search={filters.search}
          onSearchChange={(search) =>
            setFilters((current) => ({ ...current, search }))
          }
          activeFilterCount={activeFilterCount}
          onClearFilters={resetFilters}
          isSidebarCollapsed={collapsed}
          isViewOnly={isViewOnly}
        />

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          {renderList()}
        </div>

        <QueuePanel collapsed={collapsed} />

        <SidebarFooter isSidebarCollapsed={collapsed} isViewOnly={isViewOnly} />
      </aside>

      {isFilterModalOpen && (
        <FilterSortModal
          isOpen={isFilterModalOpen}
          onClose={() => setIsFilterModalOpen(false)}
          availableCategories={categories.map((category) => ({
            id: category.id,
            name: category.name,
          }))}
          currentFilters={filters}
          onApply={setFilters}
        />
      )}
    </>
  );
};

export default React.memo(SeriesSidebar);
