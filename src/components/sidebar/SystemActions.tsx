import { BookOpen, Settings, Tags } from "lucide-react";
import React from "react";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { useUIStore } from "../../stores/useUIStore";

interface SystemActionsProps {
  isViewOnly: boolean;
}

const SystemActions: React.FC<SystemActionsProps> = ({ isViewOnly }) => {
  const toggleCategoryModal = useUIStore((state) => state.toggleCategoryModal);
  const toggleSettingsModal = useUIStore((state) => state.toggleSettingsModal);
  const toggleViewOnly = useSettingsStore((state) => state.toggleViewOnly);

  return (
    <div
      className={`px-4 py-2 grid ${isViewOnly ? "grid-cols-1" : "grid-cols-3"} gap-2 border-b border-border-muted bg-surface/10`}
    >
      <button
        onClick={toggleViewOnly}
        className={`flex flex-col items-center justify-center gap-1.5 p-2 rounded-xl transition-all border ${
          isViewOnly
            ? "bg-primary/20 border-primary/40 text-primary"
            : "bg-surface-raised/50 border-border-muted text-text-dark hover:text-text-muted hover:border-border-accent"
        }`}
        title="Toggle Preview Mode"
      >
        <BookOpen className="w-4 h-4" />
        <span className="text-[8px] font-black uppercase tracking-tighter">
          Preview
        </span>
      </button>
      {!isViewOnly && (
        <>
          <button
            onClick={() => toggleCategoryModal(true)}
            className="flex flex-col items-center justify-center gap-1.5 p-2 rounded-xl bg-surface-raised/50 border border-border-muted text-text-dark hover:text-text-muted hover:border-border-accent transition-all"
            title="Manage Categories"
          >
            <Tags className="w-4 h-4" />
            <span className="text-[8px] font-black uppercase tracking-tighter">
              Tags
            </span>
          </button>
          <button
            onClick={() => toggleSettingsModal(true)}
            className="flex flex-col items-center justify-center gap-1.5 p-2 rounded-xl bg-surface-raised/50 border border-border-muted text-text-dark hover:text-text-muted hover:border-border-accent transition-all"
            title="Global Settings"
          >
            <Settings className="w-4 h-4" />
            <span className="text-[8px] font-black uppercase tracking-tighter">
              Settings
            </span>
          </button>
        </>
      )}
    </div>
  );
};

export default React.memo(SystemActions);
