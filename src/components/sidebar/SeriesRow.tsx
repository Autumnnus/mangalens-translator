import { ChevronDown, ChevronUp, Pencil, Trash2 } from "lucide-react";
import React from "react";
import { Series } from "../../types";
import { cn } from "../../utils/cn";
import { IconButton, Mono, ProgressBar } from "../ui";
import SeriesIcon from "./SeriesIcon";

interface SeriesRowProps {
  series: Series;
  active: boolean;
  collapsed: boolean;
  viewOnly: boolean;
  /** Left inset in px (12 per tree level). Ignored when collapsed. */
  indent: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onSelect: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onMoveUpDown?: (id: string, direction: "up" | "down") => void;
  onDragStart?: (event: React.DragEvent, id: string) => void;
}

/** One series in the sidebar tree: thumbnails, name, progress, hover actions. */
const SeriesRow: React.FC<SeriesRowProps> = ({
  series,
  active,
  collapsed,
  viewOnly,
  indent,
  canMoveUp,
  canMoveDown,
  onSelect,
  onEdit,
  onDelete,
  onMoveUpDown,
  onDragStart,
}) => {
  const total = series.imageCount ?? series.images.length;
  const done = series.completedCount || 0;
  const errors = series.errorCount || 0;
  const progressLabel =
    `${done} of ${total} pages translated` +
    (errors > 0 ? `, ${errors} failed` : "");

  const stop = (event: React.SyntheticEvent) => event.stopPropagation();

  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={active ? "page" : undefined}
      title={collapsed ? series.name : undefined}
      draggable={!viewOnly}
      onDragStart={(event) => onDragStart?.(event, series.id)}
      onClick={() => onSelect(series.id)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(series.id);
        }
      }}
      style={{ marginLeft: collapsed ? undefined : indent }}
      className={cn(
        "group relative flex cursor-pointer items-center gap-2 rounded-control transition-colors duration-120",
        collapsed ? "mx-1 justify-center px-0 py-1.5" : "mr-1 px-2 py-1.5",
        active
          ? "bg-npb shadow-[inset_2px_0_0_var(--c-action)]"
          : "hover:bg-page-2",
      )}
    >
      <SeriesIcon
        images={series.images}
        previewImages={series.previewImages}
        seriesName={series.name}
        imageCount={series.imageCount}
      />

      {!collapsed && (
        <>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-ink">{series.name}</p>
            <div className="mt-1 flex items-center gap-2">
              <ProgressBar
                value={done}
                max={total}
                size="sm"
                tone={errors > 0 ? "danger" : "ok"}
                label={progressLabel}
                className="flex-1"
              />
              <Mono
                className={cn("text-xs", errors > 0 ? "text-shu" : "text-ink-3")}
                title={progressLabel}
              >
                {done}/{total}
              </Mono>
            </div>
          </div>

          {!viewOnly && (
            <div
              className="pointer-events-none absolute inset-y-0 right-1 my-auto flex h-7 items-center rounded-control border border-line bg-page opacity-0 transition-opacity duration-120 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
              onClick={stop}
            >
              {canMoveUp && (
                <IconButton
                  size="sm"
                  label="Move up"
                  onClick={() => onMoveUpDown?.(series.id, "up")}
                >
                  <ChevronUp />
                </IconButton>
              )}
              {canMoveDown && (
                <IconButton
                  size="sm"
                  label="Move down"
                  onClick={() => onMoveUpDown?.(series.id, "down")}
                >
                  <ChevronDown />
                </IconButton>
              )}
              <IconButton
                size="sm"
                label={`Edit ${series.name}`}
                onClick={() => onEdit(series.id)}
              >
                <Pencil />
              </IconButton>
              <IconButton
                size="sm"
                variant="danger"
                label={`Delete ${series.name}`}
                onClick={() => onDelete(series.id)}
              >
                <Trash2 />
              </IconButton>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default React.memo(SeriesRow);
