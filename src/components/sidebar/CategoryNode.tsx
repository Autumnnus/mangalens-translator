import { ChevronRight, Plus } from "lucide-react";
import React from "react";
import { Category, Series } from "../../types";
import { cn } from "../../utils/cn";
import { IconButton, Mono } from "../ui";
import SeriesRow from "./SeriesRow";

/** Horizontal inset per tree level, in px. */
export const TREE_INDENT = 12;

interface CategoryNodeProps {
  category: Category;
  allCategories: Category[];
  series: Series[];
  depth: number;
  collapsedCategories: Set<string>;
  toggleCategory: (id: string) => void;
  activeId: string | null;
  onSelect: (id: string) => void;
  closeMobileSidebar: () => void;
  isSidebarCollapsed: boolean;
  isViewOnly?: boolean;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onMoveSeries?: (seriesId: string, categoryId: string) => void;
  onMoveCategory?: (
    categoryId: string,
    targetParentId: string | undefined,
  ) => void;
  onAddSubcategory: (parentId: string) => void;
  onMoveSeriesUpDown?: (id: string, direction: "up" | "down") => void;
  forceExpanded?: boolean;
  hideEmptyCategories?: boolean;
}

const CategoryNode: React.FC<CategoryNodeProps> = ({
  category,
  allCategories,
  series,
  depth,
  collapsedCategories,
  toggleCategory,
  activeId,
  onSelect,
  closeMobileSidebar,
  isSidebarCollapsed,
  isViewOnly,
  onEdit,
  onDelete,
  onMoveSeries,
  onMoveCategory,
  onAddSubcategory,
  onMoveSeriesUpDown,
  forceExpanded = false,
  hideEmptyCategories = false,
}) => {
  const isCollapsed = forceExpanded ? false : collapsedCategories.has(category.id);

  const categoryHasVisibleSeries = (categoryId: string): boolean => {
    if (series.some((item) => item.categoryId === categoryId)) return true;
    return allCategories
      .filter((item) => item.parentId === categoryId)
      .some((child) => categoryHasVisibleSeries(child.id));
  };

  const childrenCategories = allCategories.filter(
    (item) =>
      item.parentId === category.id &&
      (!hideEmptyCategories || categoryHasVisibleSeries(item.id)),
  );

  const directSeries = series.filter((s) => s.categoryId === category.id);

  // Count the series in this category and every category below it.
  const getTotalSeriesCount = (catId: string): number => {
    const direct = series.filter((s) => s.categoryId === catId).length;
    const children = allCategories.filter((c) => c.parentId === catId);
    const childCounts = children.reduce(
      (sum, child) => sum + getTotalSeriesCount(child.id),
      0,
    );
    return direct + childCounts;
  };

  const totalSeriesCount =
    category.id === "uncategorized"
      ? series.filter((s) => !s.categoryId).length
      : getTotalSeriesCount(category.id);

  const handleDragStart = (
    e: React.DragEvent,
    type: "series" | "category",
    id: string,
  ) => {
    if (isViewOnly) return;
    e.dataTransfer.setData("type", type);
    e.dataTransfer.setData("id", id);
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isViewOnly) return;

    const type = e.dataTransfer.getData("type");
    const id = e.dataTransfer.getData("id");

    if (type === "series" && onMoveSeries) {
      onMoveSeries(id, category.id);
    } else if (type === "category" && onMoveCategory) {
      if (id !== category.id) {
        onMoveCategory(id, category.id);
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (isViewOnly) return;
    e.preventDefault();
  };

  const toggleLabel = `${isCollapsed ? "Expand" : "Collapse"} ${category.name}`;
  const select = (id: string) => {
    onSelect(id);
    closeMobileSidebar();
  };

  return (
    <div>
      <div onDrop={handleDrop} onDragOver={handleDragOver}>
        <div
          className={cn(
            "group relative flex items-center gap-1 rounded-control transition-colors duration-120 hover:bg-page-2",
            isSidebarCollapsed ? "mx-1 justify-center py-0.5" : "mr-1 py-0.5 pr-1",
          )}
          style={{
            marginLeft: isSidebarCollapsed ? undefined : depth * TREE_INDENT + 4,
          }}
        >
          <IconButton
            size="sm"
            label={toggleLabel}
            title={isSidebarCollapsed ? category.name : toggleLabel}
            aria-expanded={!isCollapsed}
            onClick={() => toggleCategory(category.id)}
          >
            <ChevronRight
              className="transition-transform duration-120"
              style={{ transform: isCollapsed ? "none" : "rotate(90deg)" }}
            />
          </IconButton>

          {!isSidebarCollapsed && (
            <button
              type="button"
              draggable={!isViewOnly}
              onDragStart={(e) => handleDragStart(e, "category", category.id)}
              onClick={() => toggleCategory(category.id)}
              aria-expanded={!isCollapsed}
              className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-control text-left"
            >
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: category.color || "var(--c-ink-3)" }}
              />
              <span className="label-mono truncate">{category.name}</span>
              <Mono className="ml-auto pl-2 text-xs text-ink-3">
                {totalSeriesCount}
              </Mono>
            </button>
          )}

          {!isViewOnly && !isSidebarCollapsed && (
            <div className="flex shrink-0 items-center opacity-0 transition-opacity duration-120 group-hover:opacity-100 group-focus-within:opacity-100">
              <IconButton
                size="sm"
                label={`Add series to ${category.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(`new:${category.id}`);
                }}
              >
                <Plus />
              </IconButton>
            </div>
          )}
        </div>
      </div>

      {!isCollapsed && (
        <div className="relative flex flex-col gap-0.5 pb-1">
          {!isSidebarCollapsed && (
            <span
              aria-hidden="true"
              className="absolute bottom-1 top-0 w-px bg-line-2"
              style={{ left: depth * TREE_INDENT + 10 }}
            />
          )}

          {childrenCategories.map((child) => (
            <CategoryNode
              key={child.id}
              category={child}
              allCategories={allCategories}
              series={series}
              depth={depth + 1}
              collapsedCategories={collapsedCategories}
              toggleCategory={toggleCategory}
              activeId={activeId}
              onSelect={onSelect}
              closeMobileSidebar={closeMobileSidebar}
              isSidebarCollapsed={isSidebarCollapsed}
              isViewOnly={isViewOnly}
              onEdit={onEdit}
              onDelete={onDelete}
              onMoveSeries={onMoveSeries}
              onMoveCategory={onMoveCategory}
              onAddSubcategory={onAddSubcategory}
              onMoveSeriesUpDown={onMoveSeriesUpDown}
              forceExpanded={forceExpanded}
              hideEmptyCategories={hideEmptyCategories}
            />
          ))}

          {directSeries.map((s, index) => (
            <SeriesRow
              key={s.id}
              series={s}
              active={activeId === s.id}
              collapsed={isSidebarCollapsed}
              viewOnly={!!isViewOnly}
              indent={(depth + 1) * TREE_INDENT + 4}
              canMoveUp={directSeries.length > 1 && index > 0}
              canMoveDown={
                directSeries.length > 1 && index < directSeries.length - 1
              }
              onSelect={select}
              onEdit={onEdit}
              onDelete={onDelete}
              onMoveUpDown={onMoveSeriesUpDown}
              onDragStart={(e, id) => handleDragStart(e, "series", id)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default React.memo(CategoryNode);
