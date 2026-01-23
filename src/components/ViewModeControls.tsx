import { Eye, EyeOff } from "lucide-react";
import React from "react";
import { ViewMode } from "../types";

interface Props {
  showComparison: boolean;
  onToggleComparison: () => void;
  comparisonMode: ViewMode;
  onChangeMode: (mode: ViewMode) => void;
  hasTranslation?: boolean;
}

const ViewModeControls: React.FC<Props> = ({
  showComparison,
  onToggleComparison,
  comparisonMode,
  onChangeMode,
  hasTranslation = true,
}) => {
  if (!hasTranslation) return null;

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <button
        onClick={onToggleComparison}
        className={`px-3 sm:px-4 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2 border ${
          showComparison
            ? "bg-primary border-primary/30 text-white shadow-lg shadow-primary/25"
            : "bg-surface-raised border-border-muted text-text-muted hover:bg-surface-elevated hover:text-text-main"
        }`}
        title="Show original images for comparison"
      >
        {showComparison ? (
          <Eye className="w-3.5 h-3.5" />
        ) : (
          <EyeOff className="w-3.5 h-3.5" />
        )}
        <span className="hidden md:inline">Compare</span>
      </button>

      {showComparison && (
        <div className="flex bg-surface-raised/50 p-1.5 rounded-2xl border border-border-muted gap-1.5 glass">
          {(["slider", "side-by-side", "toggle"] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => onChangeMode(mode)}
              className={`px-3 sm:px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
                comparisonMode === mode
                  ? "bg-primary text-white shadow-glow"
                  : "text-text-dark hover:text-text-main hover:bg-surface-elevated"
              }`}
            >
              <span className="sm:inline hidden">
                {mode === "side-by-side" ? "Split" : mode}
              </span>
              <span className="sm:hidden inline">
                {mode === "side-by-side"
                  ? "SPL"
                  : mode === "slider"
                    ? "SLI"
                    : "TOG"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ViewModeControls;
