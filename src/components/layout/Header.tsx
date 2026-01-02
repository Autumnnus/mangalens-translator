import { BookOpen, Edit3, Sliders } from "lucide-react";
import React, { useMemo } from "react";
import { useImageProcessor } from "../../hooks/useImageProcessor";
import { useProjectExport } from "../../hooks/useProjectExport";
import { useSeriesStore } from "../../stores/useSeriesStore";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { useUIStore } from "../../stores/useUIStore";

const Header: React.FC = () => {
  const { series, activeSeriesId } = useSeriesStore();
  const { isViewOnly, toggleViewOnly, settings } = useSettingsStore();
  const { toggleCategoryModal, toggleSettingsModal } = useUIStore();
  const { downloadAllAsZip } = useProjectExport();
  const { processAll, isProcessingAll } = useImageProcessor();

  const activeSeries = series.find((s) => s.id === activeSeriesId);
  const images = activeSeries?.images || [];

  const totalStats = useMemo(() => {
    return images.reduce(
      (acc, img) => ({
        tokens: acc.tokens + (img.usage?.totalTokenCount || 0),
        cost: acc.cost + (img.cost || 0),
      }),
      { tokens: 0, cost: 0 }
    );
  }, [images]);

  return (
    <header className="sticky top-0 z-50 bg-[#0f172a]/90 backdrop-blur-xl border-b border-slate-800 p-3 sm:p-4 shadow-2xl">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center justify-between md:justify-start gap-4">
          <div>
            <div className="flex items-center gap-2 sm:gap-3 mt-1.5">
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-800 rounded-md border border-slate-700">
                <span className="text-[8px] sm:text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                  Cost
                </span>
                <span className="text-[9px] sm:text-[10px] font-black text-emerald-400 font-mono">
                  ${totalStats.cost.toFixed(4)}
                </span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-800 rounded-md border border-slate-700">
                <span className="text-[8px] sm:text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                  Tokens
                </span>
                <span className="text-[9px] sm:text-[10px] font-black text-indigo-400 font-mono">
                  {totalStats.tokens.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Mobile version toggle visibility */}
          <div className="flex items-center gap-2 md:hidden">
            <button
              onClick={toggleViewOnly}
              className={`p-2.5 rounded-xl border transition-all ${
                isViewOnly
                  ? "bg-indigo-600 border-indigo-400 text-white shadow-indigo-500/40"
                  : "bg-slate-800 border-slate-700 text-slate-400"
              }`}
            >
              {isViewOnly ? (
                <BookOpen className="w-4 h-4" />
              ) : (
                <Edit3 className="w-4 h-4" />
              )}
            </button>
            <button
              onClick={() => toggleSettingsModal(true)}
              className="p-2.5 bg-slate-800 border border-slate-700 rounded-xl text-slate-400"
            >
              <Sliders className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto no-scrollbar pb-1 md:pb-0">
          <button
            onClick={toggleViewOnly}
            className={`hidden md:flex px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-[0.15em] transition-all items-center gap-2.5 border shadow-2xl ${
              isViewOnly
                ? "bg-indigo-600 border-indigo-400 text-white shadow-indigo-500/40"
                : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
            }`}
          >
            {isViewOnly ? (
              <BookOpen className="w-4 h-4 animate-pulse" />
            ) : (
              <Edit3 className="w-4 h-4" />
            )}
            {isViewOnly ? "Reading mode" : "Editor mode"}
          </button>

          {!isViewOnly && (
            <>
              <button
                onClick={() => toggleCategoryModal(true)}
                className="p-2.5 bg-slate-800 border border-slate-700 rounded-xl text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-all shadow-xl group"
                title="Manage Categories"
              >
                <i className="fas fa-tags text-xs group-hover:scale-110 transition-transform"></i>
              </button>

              <button
                onClick={() => toggleSettingsModal(true)}
                className="p-2.5 bg-slate-800 border border-slate-700 rounded-xl text-slate-400 hover:bg-indigo-600 hover:text-white transition-all shadow-xl group"
                title="App Settings"
              >
                <Sliders className="w-4 h-4 group-hover:rotate-90 transition-transform duration-500" />
              </button>

              <button
                onClick={processAll}
                disabled={isProcessingAll || images.length === 0}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 transition-all px-4 sm:px-6 py-2.5 rounded-xl font-black flex items-center gap-2 shadow-xl shadow-indigo-500/20 text-[10px] sm:text-xs uppercase tracking-wider shrink-0"
              >
                {isProcessingAll ? (
                  <i className="fas fa-circle-notch fa-spin"></i>
                ) : (
                  <i className="fas fa-bolt"></i>
                )}
                <span className="hidden sm:inline">
                  {isProcessingAll ? "Translating..." : "Translate All"}
                </span>
                <span className="sm:hidden inline">
                  {isProcessingAll ? "Wait..." : "Translate"}
                </span>
              </button>

              {images.length > 0 && (
                <button
                  onClick={downloadAllAsZip}
                  className="bg-slate-100 text-slate-900 hover:bg-white px-4 sm:px-6 py-2.5 rounded-xl font-black flex items-center gap-2 shadow-xl text-[10px] sm:text-xs uppercase tracking-wider transition-all shrink-0"
                >
                  <i className="fas fa-archive"></i>{" "}
                  <span className="hidden sm:inline">Download ZIP</span>
                  <span className="sm:hidden inline">ZIP</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
