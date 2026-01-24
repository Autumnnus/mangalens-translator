import { Trash2 } from "lucide-react";
import React from "react";
import { Series } from "../../types";
import SeriesIcon from "./SeriesIcon";

interface UncategorizedSectionProps {
  uncategorizedSeries: Series[];
  collapsedCategories: Set<string>;
  toggleCategory: (id: string) => void;
  activeId: string | null;
  onSelect: (id: string) => void;
  setIsMobileOpen: (value: boolean) => void;
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
}

const UncategorizedSection: React.FC<UncategorizedSectionProps> = ({
  uncategorizedSeries,
  collapsedCategories,
  toggleCategory,
  activeId,
  onSelect,
  setIsMobileOpen,
  isSidebarCollapsed,
  isViewOnly,
  onEdit,
  onDelete,
  onMoveSeries,
  onMoveCategory,
  onMoveSeriesUpDown,
}) => {
  if (uncategorizedSeries.length === 0) return null;

  const isCollapsed = collapsedCategories.has("uncategorized");

  return (
    <div className="border-b border-slate-800/50">
      <button
        onClick={() => toggleCategory("uncategorized")}
        onDrop={(e) => {
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
        }}
        onDragOver={(e) => !isViewOnly && e.preventDefault()}
        className={`w-full flex items-center justify-between hover:bg-slate-800/30 transition-colors group px-4 py-3 ${
          isSidebarCollapsed ? "justify-center" : ""
        }`}
      >
        <div className="flex items-center gap-2">
          <i
            className={`fas fa-chevron-${
              isCollapsed ? "right" : "down"
            } text-[10px] text-slate-500 transition-transform`}
          ></i>
          {!isSidebarCollapsed && (
            <>
              <span className="text-xs font-black uppercase tracking-wider text-slate-400">
                Uncategorized
              </span>
              <span className="text-[10px] font-bold text-slate-600 bg-slate-800 px-2 py-0.5 rounded-full">
                {uncategorizedSeries.length}
              </span>
            </>
          )}
        </div>
      </button>
      {!isCollapsed && (
        <div className="space-y-1 pb-2">
          {uncategorizedSeries
            .sort((a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0))
            .map((s, index) => (
              <div
                key={s.id}
                draggable={!isViewOnly}
                onDragStart={(e) => {
                  if (isViewOnly) return;
                  e.dataTransfer.setData("type", "series");
                  e.dataTransfer.setData("id", s.id);
                }}
                onClick={() => {
                  onSelect(s.id);
                  setIsMobileOpen(false);
                }}
                className={`group flex items-center gap-2 px-2 py-2.5 rounded-xl transition-all cursor-pointer ${
                  activeId === s.id
                    ? "bg-indigo-600/20 border border-indigo-500/50"
                    : "hover:bg-slate-800/50 border border-transparent"
                }`}
              >
                {!isViewOnly &&
                  !isSidebarCollapsed &&
                  uncategorizedSeries.length > 1 && (
                    <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      {index > 0 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onMoveSeriesUpDown?.(s.id, "up");
                          }}
                          className="p-0.5 hover:text-indigo-400 transition-colors"
                        >
                          <i className="fas fa-chevron-up text-[10px]"></i>
                        </button>
                      )}
                      {index < uncategorizedSeries.length - 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onMoveSeriesUpDown?.(s.id, "down");
                          }}
                          className="p-0.5 hover:text-indigo-400 transition-colors"
                        >
                          <i className="fas fa-chevron-down text-[10px]"></i>
                        </button>
                      )}
                    </div>
                  )}
                <SeriesIcon images={s.images} previewImages={s.previewImages} />
                {!isSidebarCollapsed && (
                  <>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate">{s.name}</p>
                      <p className="text-[10px] text-slate-500 font-bold">
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
  );
};

export default React.memo(UncategorizedSection);
