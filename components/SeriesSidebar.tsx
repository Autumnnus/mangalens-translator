import { Folder, Hash, Plus, Trash2 } from "lucide-react";
import React from "react";
import { Series } from "../types";

interface Props {
  series: Series[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
}

const SeriesSidebar: React.FC<Props> = ({
  series,
  activeId,
  onSelect,
  onAdd,
  onDelete,
}) => {
  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col hidden lg:flex">
      <div className="p-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="bg-indigo-600 p-1.5 rounded-lg">
            <Folder className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight">VisionSwap</span>
        </div>
      </div>

      <div className="px-4 py-2">
        <button
          onClick={onAdd}
          className="w-full py-2.5 px-4 rounded-xl border-2 border-dashed border-slate-700 hover:border-indigo-500 hover:bg-indigo-500/5 text-slate-400 hover:text-indigo-400 flex items-center justify-center gap-2 transition-all group"
        >
          <Plus className="w-4 h-4 group-hover:rotate-90 transition-transform" />
          <span className="text-sm font-semibold">New Series</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1 custom-scrollbar">
        <h3 className="px-4 text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-3">
          Collections
        </h3>
        {series.map((s) => (
          <div
            key={s.id}
            onClick={() => onSelect(s.id)}
            className={`group relative flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all ${
              activeId === s.id
                ? "bg-indigo-600/10 text-indigo-400 ring-1 ring-indigo-500/50"
                : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            }`}
          >
            <Hash
              className={`w-4 h-4 ${
                activeId === s.id ? "text-indigo-400" : "text-slate-600"
              }`}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{s.name}</p>
              <p className="text-[10px] opacity-60">{s.images.length} items</p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(s.id);
              }}
              className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-500 hover:text-rose-400 transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
};

export default SeriesSidebar;
