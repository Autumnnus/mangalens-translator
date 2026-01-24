import { Filter, Plus } from "lucide-react";
import React from "react";

interface SidebarActionsProps {
  onAdd: () => void;
  onOpenFilter: () => void;
  isViewOnly?: boolean;
}

const SidebarActions: React.FC<SidebarActionsProps> = ({
  onAdd,
  onOpenFilter,
  isViewOnly = false,
}) => {
  return (
    <div className="px-4 py-3 space-y-2 border-b border-border-muted bg-surface/30">
      {!isViewOnly && (
        <button
          onClick={onAdd}
          className="w-full bg-primary hover:bg-primary-hover text-white px-4 py-2.5 rounded-xl font-black text-xs uppercase flex items-center justify-center gap-2 transition-all shadow-lg shadow-primary/25 hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" />
          New Series
        </button>
      )}
      <button
        onClick={onOpenFilter}
        className="w-full bg-surface-raised hover:bg-surface-elevated text-text-muted hover:text-text-main px-3 py-2 rounded-xl font-black text-xs uppercase flex items-center justify-center gap-2 transition-all border border-border-muted"
      >
        <Filter className="w-3.5 h-3.5" />
        Filter
      </button>
    </div>
  );
};

export default React.memo(SidebarActions);
