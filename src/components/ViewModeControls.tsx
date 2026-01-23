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
        className={`px-3 sm:px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all flex items-center gap-2 border ${
          showComparison
            ? "bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/30"
            : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700"
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
        <div className="flex bg-slate-800/50 p-1 rounded-xl border border-slate-700 gap-1">
          {(["slider", "side-by-side", "toggle"] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => onChangeMode(mode)}
              className={`px-2 sm:px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
                comparisonMode === mode
                  ? "bg-indigo-600 text-white shadow-lg"
                  : "text-slate-400 hover:text-white hover:bg-slate-700"
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
