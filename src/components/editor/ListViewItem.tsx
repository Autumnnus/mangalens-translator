import React from "react";
import { ProcessedImage } from "../../types";

interface ListViewItemProps {
  image: ProcessedImage;
  onSelect: (id: string) => void;
}

const ListViewItem: React.FC<ListViewItemProps> = ({ image, onSelect }) => {
  return (
    <div
      onClick={() => onSelect(image.id)}
      className="bg-surface-raised/50 p-2 rounded-xl flex items-center gap-4 border border-border-subtle hover:border-primary/30 transition-all cursor-pointer group glass"
    >
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
