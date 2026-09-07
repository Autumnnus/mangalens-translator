import { ChevronRight } from "lucide-react";
import React from "react";
import { Series } from "../../types";
import { cn } from "../../utils/cn";
import { IconButton, Mono } from "../ui";
import { TREE_INDENT } from "./CategoryNode";
import SeriesRow from "./SeriesRow";

interface UncategorizedSectionProps {
  uncategorizedSeries: Series[];
  collapsedCategories: Set<string>;
  toggleCategory: (id: string) => void;
  activeId: string | null;
  onSelect: (id: string) => void;
  closeMobileSidebar: () => void;
  isSidebarCollapsed: boolean;
  isViewOnly: boolean;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onMoveSeries?: (seriesId: string, categoryId: string) => void;
  onMoveCategory?: (
    categoryId: string,
    targetParentId: string | undefined,
  ) => void;
  onMoveSeriesUpDown?: (id: string, direction: "up" | "down") => void;
  forceExpanded?: boolean;
}

const UncategorizedSection: React.FC<UncategorizedSectionProps> = ({
  uncategorizedSeries,
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
  onMoveSeriesUpDown,
  forceExpanded = false,
}) => {
  if (uncategorizedSeries.length === 0) return null;

  const isCollapsed = forceExpanded
    ? false
    : collapsedCategories.has("uncategorized");

  const toggleLabel = `${isCollapsed ? "Expand" : "Collapse"} uncategorized series`;
  const select = (id: string) => {
    onSelect(id);
    closeMobileSidebar();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (isViewOnly) return;
    const type = e.dataTransfer.getData("type");
    const id = e.dataTransfer.getData("id");
    if (type === "series" && onMoveSeries) {
      onMoveSeries(id, "");
    } else if (type === "category" && onMoveCategory) {
      if (id) {
        onMoveCategory(id, undefined);
      }
    }
  };

  return (
    <div>
      <div
        onDrop={handleDrop}
        onDragOver={(e) => !isViewOnly && e.preventDefault()}
        className={cn(
          "flex items-center gap-1 rounded-control transition-colors duration-120 hover:bg-page-2",
          isSidebarCollapsed ? "mx-1 justify-center py-0.5" : "ml-1 mr-1 py-0.5 pr-1",
        )}
      >
        <IconButton
          size="sm"
          label={toggleLabel}
          title={isSidebarCollapsed ? "Uncategorized" : toggleLabel}
          aria-expanded={!isCollapsed}
          onClick={() => toggleCategory("uncategorized")}
        >
          <ChevronRight
            className="transition-transform duration-120"
            style={{ transform: isCollapsed ? "none" : "rotate(90deg)" }}
          />
        </IconButton>

        {!isSidebarCollapsed && (
          <button
            type="button"
            onClick={() => toggleCategory("uncategorized")}
            aria-expanded={!isCollapsed}
            className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-control text-left"
          >
            <span
              aria-hidden="true"
              className="h-2 w-2 shrink-0 rounded-full border border-ink-3"
            />
            <span className="label-mono truncate">Uncategorized</span>
            <Mono className="ml-auto pl-2 text-xs text-ink-3">
              {uncategorizedSeries.length}
            </Mono>
          </button>
        )}
      </div>

      {!isCollapsed && (
        <div className="relative flex flex-col gap-0.5 pb-1">
          {!isSidebarCollapsed && (
            <span
              aria-hidden="true"
              className="absolute bottom-1 top-0 w-px bg-line-2"
              style={{ left: 10 }}
            />
          )}
          {uncategorizedSeries.map((s, index) => (
            <SeriesRow
              key={s.id}
              series={s}
              active={activeId === s.id}
              collapsed={isSidebarCollapsed}
              viewOnly={isViewOnly}
              indent={TREE_INDENT + 4}
              canMoveUp={uncategorizedSeries.length > 1 && index > 0}
              canMoveDown={
                uncategorizedSeries.length > 1 &&
                index < uncategorizedSeries.length - 1
              }
              onSelect={select}
              onEdit={onEdit}
              onDelete={onDelete}
              onMoveUpDown={onMoveSeriesUpDown}
              onDragStart={(e, id) => {
                if (isViewOnly) return;
                e.dataTransfer.setData("type", "series");
                e.dataTransfer.setData("id", id);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default React.memo(UncategorizedSection);
