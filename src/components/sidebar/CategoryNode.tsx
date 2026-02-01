import { Plus, Trash2 } from "lucide-react";
import React from "react";
import { Category, Series } from "../../types";
import SeriesIcon from "./SeriesIcon";

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
}) => {
  const isCollapsed = collapsedCategories.has(category.id);

  const childrenCategories = allCategories.filter(
    (c) => c.parentId === category.id,
  );

  const directSeries = series.filter((s) => s.categoryId === category.id);

  // Recursive olarak bu kategori ve altındaki tüm serileri say
  const getTotalSeriesCount = (catId: string): number => {
    const direct = series.filter((s) => s.categoryId === catId).length;
    const children = allCategories.filter((c) => c.parentId === catId);
    const childCounts = children.reduce(
      (sum, child) => sum + getTotalSeriesCount(child.id),
      0,
    );
    return direct + childCounts;
  };

  const totalSeriesCount = getTotalSeriesCount(category.id);

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

  return (
    <div className="border-b border-border-subtle last:border-b-0">
      <div
        className="group relative"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <div
          className={`flex items-center hover:bg-surface-raised/30 transition-all group-hover:bg-surface-raised/50 relative
              ${isSidebarCollapsed ? "px-2 py-3 justify-center" : "px-4 py-2.5"}
            `}
          style={{
            paddingLeft: !isSidebarCollapsed
              ? `${depth * 16 + 16}px`
              : undefined,
          }}
        >
          {!isSidebarCollapsed && depth > 0 && (
            <div
              className="absolute left-0 top-0 bottom-0 border-l border-border-muted"
              style={{ left: `${depth * 16 + 4}px` }}
            />
          )}

          <button
            onClick={() => toggleCategory(category.id)}
            draggable={!isViewOnly}
            onDragStart={(e) => handleDragStart(e, "category", category.id)}
            className="flex-1 flex items-center gap-2 overflow-hidden text-left"
          >
            <i
              className={`fas fa-chevron-${
                isCollapsed ? "right" : "down"
              } text-[10px] ${
                isCollapsed ? "text-text-dark" : "text-primary"
              } transition-transform shrink-0 w-3`}
            ></i>
            {!isSidebarCollapsed && (
              <div className="flex items-center gap-2 truncate">
                <div
                  className="w-2 h-2 rounded-full shrink-0 shadow-sm"
                  style={{ backgroundColor: category.color || "#6366f1" }}
                />
                <span
                  className={`text-xs font-black uppercase tracking-wider truncate transition-colors ${
                    isCollapsed
                      ? "text-text-muted/60"
                      : "text-text-main text-glow"
                  }`}
                >
                  {category.name}
                </span>
                <span className="text-[9px] font-bold text-text-dark bg-surface-raised/80 px-1.5 py-0.5 rounded-md shrink-0 border border-border-muted/30">
                  {category.id === "uncategorized"
                    ? series.filter((s) => !s.categoryId).length
                    : totalSeriesCount}
                </span>
              </div>
            )}
          </button>

          {!isViewOnly && !isSidebarCollapsed && (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity absolute right-4">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(`new:${category.id}`);
                }}
                className="w-6 h-6 bg-surface-raised hover:bg-primary/20 text-text-dark hover:text-primary rounded-lg flex items-center justify-center transition-all border border-border-muted/50"
                title="Add Series to Category"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </div>

      {!isCollapsed && (
        <>
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
            />
          ))}

          <div
            className={`space-y-1 pb-1 ${!isSidebarCollapsed ? "pr-2" : ""}`}
          >
            {directSeries
              .sort((a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0))
              .map((s, index) => (
                <div
                  key={s.id}
                  draggable={!isViewOnly}
                  onDragStart={(e) => handleDragStart(e, "series", s.id)}
                  onClick={() => {
                    onSelect(s.id);
                    closeMobileSidebar();
                  }}
                  style={{
                    paddingLeft: !isSidebarCollapsed
                      ? `${(depth + 1) * 16 + 16}px`
                      : undefined,
                  }}
                  className={`group flex items-center gap-2 px-2 py-2 rounded-xl transition-all cursor-pointer border ${
                    activeId === s.id
                      ? "bg-primary/10 border-primary/40 shadow-glow"
                      : "hover:bg-surface-raised/50 border-transparent hover:border-border-muted"
                  }`}
                >
                  {!isViewOnly &&
                    !isSidebarCollapsed &&
                    directSeries.length > 1 && (
                      <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        {index > 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onMoveSeriesUpDown?.(s.id, "up");
                            }}
                            className="p-0.5 hover:text-primary transition-colors"
                          >
                            <i className="fas fa-chevron-up text-[10px]"></i>
                          </button>
                        )}
                        {index < directSeries.length - 1 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onMoveSeriesUpDown?.(s.id, "down");
                            }}
                            className="p-0.5 hover:text-primary transition-colors"
                          >
                            <i className="fas fa-chevron-down text-[10px]"></i>
                          </button>
                        )}
                      </div>
                    )}
                  <SeriesIcon
                    images={s.images}
                    previewImages={s.previewImages}
                  />
                  {!isSidebarCollapsed && (
                    <>
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-sm font-bold truncate transition-colors ${activeId === s.id ? "text-primary" : "text-text-main group-hover:text-primary/90"}`}
                        >
                          {s.name}
                        </p>
                        <p className="text-[10px] text-text-dark font-bold">
                          {s.imageCount ?? s.images.length} pages
                        </p>
                      </div>
                      {!isViewOnly && (
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onEdit(s.id);
                            }}
                            className="w-7 h-7 bg-surface-elevated hover:bg-primary rounded-lg flex items-center justify-center transition-all hover:scale-105 active:scale-95"
                          >
                            <i className="fas fa-edit text-[10px]"></i>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDelete(s.id);
                            }}
                            className="w-7 h-7 bg-surface-elevated hover:bg-red-600/80 rounded-lg flex items-center justify-center transition-all hover:scale-105 active:scale-95"
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
        </>
      )}
    </div>
  );
};

export default React.memo(CategoryNode);
