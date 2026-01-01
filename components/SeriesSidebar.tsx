import { Download, Folder, Hash, Plus, Trash2 } from "lucide-react";
import React from "react";
import { ProcessedImage, Series } from "../types";

interface Props {
  series: Series[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
  onExportAll: () => void;
  isOpen: boolean;
  onClose: () => void;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isViewOnly?: boolean;
}

const SeriesIcon = ({ images }: { images: ProcessedImage[] }) => {
  const [isExpanded, setIsExpanded] = React.useState(false);

  if (images.length === 0) {
    return (
      <div className="w-10 h-10 flex items-center justify-center bg-slate-800 rounded-lg border border-slate-700">
        <Hash className="w-4 h-4 text-slate-500" />
      </div>
    );
  }

  const getIndices = () => {
    if (images.length === 1) return [0];
    if (images.length === 2) return [0, 1];

    const first = 0;
    const last = images.length - 1;
    // Get a middle index
    const middle = Math.floor(images.length / 2);

    return [first, middle, last];
  };

  const indices = getIndices();

  if (isExpanded) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        onClick={(e) => {
          e.stopPropagation();
          setIsExpanded(false);
        }}
      >
        <div className="bg-slate-900 p-4 rounded-2xl border border-slate-700 flex gap-4 shadow-2xl animate-in zoom-in-95">
          {indices.map((idx) => (
            <div
              key={idx}
              className="w-32 h-48 bg-slate-800 rounded-lg overflow-hidden border border-slate-600"
            >
              <img
                src={images[idx].translatedUrl || images[idx].originalUrl}
                className="w-full h-full object-cover"
                alt=""
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative w-10 h-10 flex-shrink-0 cursor-pointer"
      onClick={(e) => {
        e.stopPropagation();
        if (images.length > 0) setIsExpanded(true);
      }}
      title="Click to preview key frames"
    >
      {indices.map((idx, i) => (
        <div
          key={idx + "-" + i}
          className="absolute w-7 h-7 border border-slate-700 rounded-md overflow-hidden bg-slate-800 shadow-lg"
          style={{
            top: `${i * 3}px`,
            left: `${i * 3}px`,
            zIndex: i,
            transform: `rotate(${i * 4 - 4}deg)`,
          }}
        >
          <img
            src={images[idx].translatedUrl || images[idx].originalUrl}
            className="w-full h-full object-cover"
            alt=""
          />
        </div>
      ))}
    </div>
  );
};

const SeriesSidebar: React.FC<Props> = ({
  series,
  activeId,
  onSelect,
  onAdd,
  onDelete,
  onExportAll,
  isOpen,
  onClose,
  onImport,
  onEdit,
  isViewOnly = false,
}) => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(false);

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`
        fixed inset-y-0 left-0 z-50 bg-slate-900 border-r border-slate-800 flex flex-col transition-all duration-300 ease-in-out lg:translate-x-0 lg:static lg:flex
        ${isOpen ? "translate-x-0" : "-translate-x-full"}
        ${isSidebarCollapsed ? "w-20" : "w-72"}
      `}
      >
        <div
          className={`p-6 flex items-center ${
            isSidebarCollapsed ? "justify-center" : "justify-between"
          }`}
        >
          <div className="flex items-center gap-2">
            <div className="bg-gradient-to-tr from-indigo-600 to-fuchsia-600 p-2 rounded-xl shadow-lg shadow-indigo-500/20">
              <Folder className="w-5 h-5 text-white" />
            </div>
            {!isSidebarCollapsed && (
              <span className="font-black text-xl tracking-tighter uppercase italic">
                Vision<span className="text-indigo-400">Swap</span>
              </span>
            )}
          </div>
          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="hidden lg:block p-1.5 text-slate-500 hover:text-white transition-colors"
          >
            <i
              className={`fas fa-chevron-${
                isSidebarCollapsed ? "right" : "left"
              }`}
            ></i>
          </button>
        </div>

        {!isViewOnly && !isSidebarCollapsed && (
          <div className="px-4 py-2 space-y-2 animate-in fade-in duration-300">
            <button
              onClick={onAdd}
              className="w-full py-3 px-4 rounded-xl border-2 border-dashed border-slate-800 hover:border-indigo-500/50 hover:bg-indigo-500/5 text-slate-500 hover:text-indigo-400 flex items-center justify-center gap-2 transition-all group"
            >
              <Plus className="w-4 h-4 group-hover:rotate-90 transition-transform" />
              <span className="text-sm font-bold uppercase tracking-wider">
                New Series
              </span>
            </button>

            <label className="w-full py-3 px-4 rounded-xl border border-slate-800 bg-slate-800/20 hover:bg-slate-800/40 text-slate-500 hover:text-amber-400 flex items-center justify-center gap-2 transition-all cursor-pointer group">
              <input
                type="file"
                accept=".zip"
                className="hidden"
                onChange={onImport}
              />
              <Download className="w-4 h-4 rotate-180" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em]">
                Bulk Import
              </span>
            </label>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1 custom-scrollbar">
          <h3 className="px-4 text-[10px] font-black text-slate-600 uppercase tracking-[0.3em] mb-4">
            Project Library
          </h3>
          {series.map((s) => (
            <div
              key={s.id}
              onClick={() => onSelect(s.id)}
              className={`group relative flex items-center gap-4 px-4 py-4 rounded-2xl cursor-pointer transition-all ${
                activeId === s.id
                  ? "bg-indigo-600/10 text-indigo-400 ring-1 ring-indigo-500/30 shadow-inner"
                  : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
              }`}
            >
              <SeriesIcon images={s.images} />

              {!isSidebarCollapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate leading-tight">
                    {s.name}
                  </p>
                  <p className="text-[10px] uppercase font-black opacity-40 tracking-widest mt-0.5">
                    {s.images.length} Pages
                  </p>
                </div>
              )}

              {!isSidebarCollapsed && !isViewOnly && (
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(s.id);
                    }}
                    className="p-1.5 text-slate-600 hover:text-indigo-400 transition-all hover:scale-110"
                  >
                    <i className="fas fa-edit text-xs"></i>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(s.id);
                    }}
                    className="p-1.5 text-slate-600 hover:text-rose-500 transition-all hover:scale-110"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-slate-800 bg-slate-900/50 backdrop-blur-xl">
          <button
            onClick={onExportAll}
            className="w-full py-3 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center gap-3 transition-all border border-slate-700 shadow-xl"
          >
            <Download className="w-4 h-4 text-indigo-400" />
            <span className="text-xs font-black uppercase tracking-widest">
              Download All Series
            </span>
          </button>

          <div
            className={`mt-4 bg-slate-900/40 rounded-2xl p-4 border border-slate-800/50 flex items-center gap-3 ${
              isSidebarCollapsed ? "justify-center p-2" : ""
            }`}
          >
            <div className="w-8 h-8 flex-shrink-0 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 shadow-lg" />
            {!isSidebarCollapsed && (
              <div>
                <p className="text-xs font-black uppercase tracking-tight">
                  Pro Account
                </p>
                <p className="text-[10px] font-bold text-slate-500">
                  Storage Usage: 84%
                </p>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};

export default SeriesSidebar;
