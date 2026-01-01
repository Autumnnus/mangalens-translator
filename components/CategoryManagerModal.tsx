import { Check, Edit2, Trash2, X } from "lucide-react";
import React, { useState } from "react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  categories: string[];
  onUpdateCategory: (oldName: string, newName: string) => void;
  onDeleteCategory: (name: string) => void;
}

const CategoryManagerModal: React.FC<Props> = ({
  isOpen,
  onClose,
  categories,
  onUpdateCategory,
  onDeleteCategory,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  if (!isOpen) return null;

  const handleStartEdit = (cat: string) => {
    setEditingId(cat);
    setEditValue(cat);
  };

  const handleSaveEdit = (cat: string) => {
    if (editValue.trim() && editValue !== cat) {
      onUpdateCategory(cat, editValue.trim());
    }
    setEditingId(null);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-800/50">
          <h2 className="text-xl font-black uppercase tracking-tight text-white italic">
            Manage <span className="text-indigo-400">Categories</span>
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 max-h-[60vh] overflow-y-auto space-y-2 custom-scrollbar">
          {categories.map((cat) => (
            <div
              key={cat}
              className="group flex items-center gap-3 p-3 bg-slate-800/40 rounded-xl border border-slate-800 hover:border-slate-700 transition-all"
            >
              {editingId === cat ? (
                <div className="flex-1 flex gap-2">
                  <input
                    autoFocus
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="flex-1 bg-slate-900 border border-indigo-500/50 rounded-lg px-3 py-1 text-sm outline-none"
                    onKeyDown={(e) => e.key === "Enter" && handleSaveEdit(cat)}
                  />
                  <button
                    onClick={() => handleSaveEdit(cat)}
                    className="p-1.5 text-emerald-400 hover:text-emerald-300"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <span className="flex-1 text-sm font-bold text-slate-300">
                    {cat}
                  </span>
                  <button
                    onClick={() => handleStartEdit(cat)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-500 hover:text-indigo-400 transition-all"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  {cat !== "Uncategorized" && (
                    <button
                      onClick={() => onDeleteCategory(cat)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-500 hover:text-rose-400 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>

        <div className="p-6 bg-slate-800/30 border-t border-slate-800">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center italic">
            Careful: Changes affect all linked series
          </p>
        </div>
      </div>
    </div>
  );
};

export default CategoryManagerModal;
