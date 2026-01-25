import React from "react";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { Series } from "../../types";

interface EditorHeaderProps {
  activeSeries: Series | undefined;
  totalStats: { tokens: number; cost: number };
  imageCount: number;
  isProcessingAll: boolean;
  onProcessAll: () => void;
  viewMode: string;
  setViewMode: (mode: "grid" | "list" | "detail") => void;
  isViewOnly: boolean;
  onUpload: (files: FileList | null) => void;
  onWipe: () => void;
}

const EditorHeader: React.FC<EditorHeaderProps> = ({
  activeSeries,
  totalStats,
  imageCount,
  isProcessingAll,
  onProcessAll,
  viewMode,
  setViewMode,
  isViewOnly,
  onUpload,
  onWipe,
}) => {
  const settings = useSettingsStore((state) => state.settings);
  const updateSettings = useSettingsStore((state) => state.updateSettings);

  return (
    <div className="flex flex-col xl:flex-row justify-between xl:items-end gap-6 mb-8 px-2">
      <div className="space-y-4">
        <div>
          <h3 className="text-2xl sm:text-3xl font-black tracking-tighter uppercase mb-2">
            Editor Workspace
          </h3>
          <p className="text-text-dark font-bold text-xs sm:text-sm tracking-wide flex flex-wrap gap-x-4 gap-y-1">
            <span>
              Working on{" "}
              <span className="text-text-main font-black italic underline decoration-primary/50 underline-offset-4">
                {activeSeries?.name}
              </span>
            </span>
            {activeSeries?.author && (
              <span className="flex items-center gap-1.5 flex-nowrap">
                <span className="text-[10px] text-text-dark/60 uppercase tracking-tighter">
                  By
                </span>
                <span className="text-text-muted font-black italic">
                  {activeSeries.author}
                </span>
              </span>
            )}
            {activeSeries?.group && (
              <span className="flex items-center gap-1.5 flex-nowrap">
                <span className="text-[10px] text-text-dark/60 uppercase tracking-tighter">
                  Group
                </span>
                <span className="text-text-muted font-black italic">
                  {activeSeries.group}
                </span>
              </span>
            )}
            {activeSeries?.originalTitle && (
              <span className="flex items-center gap-1.5 flex-nowrap">
                <span className="text-[10px] text-text-dark/60 uppercase tracking-tighter">
                  Original
                </span>
                <span className="text-text-muted font-black italic">
                  {activeSeries.originalTitle}
                </span>
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1 bg-surface-raised/50 rounded-lg border border-border-muted shadow-sm">
            <span className="text-[9px] font-bold text-text-dark uppercase tracking-widest">
              Cost
            </span>
            <span className="text-xs font-black text-emerald-400 font-mono">
              ${totalStats.cost.toFixed(4)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 bg-surface-raised/50 rounded-lg border border-border-muted shadow-sm">
            <span className="text-[9px] font-bold text-text-dark uppercase tracking-widest">
              Tokens
            </span>
            <span className="text-xs font-black text-primary font-mono">
              {totalStats.tokens.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 bg-surface-raised/50 rounded-lg border border-border-muted shadow-sm">
            <span className="text-[9px] font-bold text-text-dark uppercase tracking-widest">
              Items
            </span>
            <span className="text-xs font-black text-text-muted font-mono">
              {imageCount}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center">
            <button
              onClick={onProcessAll}
              disabled={isProcessingAll || imageCount === 0}
              className="bg-primary hover:bg-primary-hover disabled:bg-surface-raised disabled:text-text-dark transition-all px-4 py-2 rounded-l-xl font-black flex items-center gap-2 shadow-lg shadow-primary/20 text-[10px] uppercase tracking-wider border border-primary/20 border-r-0"
            >
              {isProcessingAll ? (
                <i className="fas fa-circle-notch fa-spin"></i>
              ) : (
                <i className="fas fa-bolt"></i>
              )}
              {isProcessingAll ? "Translating..." : "Translate All"}
            </button>
            <div className="flex items-center gap-2 bg-surface-raised/50 px-3 py-2 border border-border-muted border-l-0 rounded-r-xl h-[34px] group hover:border-primary/50 transition-colors cursor-pointer relative pr-8">
              <span className="text-[9px] font-bold text-text-dark uppercase tracking-widest leading-none select-none">
                Batch
              </span>
              <select
                value={settings.batchSize ?? 10}
                onChange={(e) =>
                  updateSettings({ batchSize: parseInt(e.target.value) })
                }
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              >
                {[...Array(10)].map((_, i) => (
                  <option
                    key={i + 1}
                    value={i + 1}
                    className="bg-slate-900 text-white"
                  >
                    {i + 1}
                  </option>
                ))}
              </select>
              <span className="text-[10px] font-black text-primary min-w-[0.8rem] text-center pointer-events-none">
                {settings.batchSize ?? 10}
              </span>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-primary/30 group-hover:text-primary/60 transition-colors">
                <i className="fas fa-chevron-down text-[8px]"></i>
              </div>
            </div>
          </div>
          <div className="flex bg-surface-raised/50 rounded-xl p-1 border border-border-subtle">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-2 rounded-lg transition-all ${
                viewMode === "grid"
                  ? "bg-primary text-white shadow-glow"
                  : "text-text-dark hover:text-text-muted"
              }`}
            >
              <i className="fas fa-th-large"></i>
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-2 rounded-lg transition-all ${
                viewMode === "list"
                  ? "bg-primary text-white shadow-glow"
                  : "text-text-dark hover:text-text-muted"
              }`}
            >
              <i className="fas fa-list"></i>
            </button>
            <button
              onClick={() => setViewMode("detail")}
              className={`p-2 rounded-lg transition-all ${
                viewMode === "detail"
                  ? "bg-primary text-white shadow-glow"
                  : "text-text-dark hover:text-text-muted"
              }`}
            >
              <i className="fas fa-square"></i>
            </button>
          </div>
        </div>

        {!isViewOnly && (
          <div className="flex flex-wrap items-center gap-3 justify-end">
            <label className="cursor-pointer text-slate-400 hover:text-green-400 text-[10px] uppercase font-bold flex items-center gap-1 transition-colors">
              <input
                type="file"
                multiple
                accept="image/*,.pdf"
                className="hidden"
                onChange={(e) => onUpload(e.target.files)}
              />
              <i className="fas fa-plus"></i> Add pages
            </label>
            <button
              onClick={onWipe}
              className="text-slate-400 hover:text-red-400 text-[10px] uppercase font-bold flex items-center gap-1 transition-colors"
            >
              <i className="fas fa-trash"></i> Wipe All
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(EditorHeader);
