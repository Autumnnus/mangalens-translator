import React from "react";
import { ProcessedImage } from "../../types";

interface ListViewItemProps {
  image: ProcessedImage;
  onSelect: () => void;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}

const ListViewItem: React.FC<ListViewItemProps> = ({
  image,
  onSelect,
  isSelected = false,
  onToggleSelect,
}) => {
  return (
    <div
      onClick={onSelect}
      className={`bg-surface-raised/50 p-2 rounded-xl flex items-center gap-4 border transition-all cursor-pointer group glass ${
        isSelected
          ? "border-primary ring-1 ring-primary/70 shadow-glow"
          : "border-border-subtle hover:border-primary/30"
      }`}
    >
      {onToggleSelect && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleSelect();
          }}
          aria-label={`${isSelected ? "Unselect" : "Select"} ${image.fileName}`}
          aria-pressed={isSelected}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-all ${
            isSelected
              ? "border-primary bg-primary text-white"
              : "border-border-muted bg-surface text-text-muted hover:border-primary/70 hover:text-primary"
          }`}
        >
          <i className={`fas ${isSelected ? "fa-check" : "fa-square"} text-xs`} />
        </button>
      )}
      <div className="w-12 h-16 bg-slate-900 rounded-md overflow-hidden shrink-0">
        <img
          src={image.originalUrl}
          className="w-full h-full object-cover"
          alt={image.fileName}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-slate-500 text-[10px] font-mono">
            #{image.sequenceNumber}
          </span>
          <h4
            className="text-slate-200 font-bold text-xs truncate"
            title={image.fileName}
          >
            {image.fileName}
          </h4>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`text-[10px] font-bold uppercase tracking-wider ${
              image.status === "completed"
                ? "text-emerald-400"
                : image.status === "processing"
                  ? "text-amber-400"
                  : "text-slate-500"
            }`}
          >
            {image.status}
          </span>
          {image.cost && (
            <span className="text-[10px] text-slate-500">
              ${image.cost.toFixed(4)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(ListViewItem);
