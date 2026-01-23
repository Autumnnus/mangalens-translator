import { Check, Edit2, Plus, Trash2, X } from "lucide-react";
import React, { useState } from "react";
import { Category } from "../types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  onUpdateCategory: (id: string, name: string) => void;
  onDeleteCategory: (id: string) => void;
  onAddCategory: (name: string, parentId?: string) => void;
  initialParentId?: string;
}

const CategoryManagerModal: React.FC<Props> = ({
  isOpen,
  onClose,
  categories,
  onUpdateCategory,
  onDeleteCategory,
  onAddCategory,
  initialParentId,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [selectedParentId, setSelectedParentId] = useState<string>(
    initialParentId || "",
  );

  React.useEffect(() => {
    if (isOpen && initialParentId) {
      setSelectedParentId(initialParentId);
    } else if (isOpen) {
      setSelectedParentId("");
    }
  }, [isOpen, initialParentId]);

  if (!isOpen) return null;

  const handleStartEdit = (cat: Category) => {
    setEditingId(cat.id);
    setEditValue(cat.name);
  };

  const handleSaveEdit = (cat: Category) => {
    if (editValue.trim() && editValue !== cat.name) {
      onUpdateCategory(cat.id, editValue.trim());
    }
    setEditingId(null);
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newCategoryName.trim()) {
      onAddCategory(
        newCategoryName.trim(),
        selectedParentId === "" ? undefined : selectedParentId,
      );
      setNewCategoryName("");
      // Keep parent selection or reset? Resetting is probably safer.
    }
  };

  // Organize by hierarchy for display
  const rootCategories = categories.filter((c) => !c.parentId);
  const getChildren = (parentId: string) =>
    categories.filter((c) => c.parentId === parentId);

  const renderCategoryItem = (cat: Category, level: number = 0) => {
    const isEditing = editingId === cat.id;

    return (
      <div key={cat.id} className="space-y-1">
        <div
          className={`group flex items-center gap-3 p-3 bg-surface-raised/50 rounded-xl border border-border-muted hover:border-border-accent transition-all ${
            level > 0 ? "ml-6 border-l-2 border-l-primary/30" : ""
          }`}
        >
          {isEditing ? (
            <div className="flex-1 flex gap-2">
              <input
                autoFocus
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="flex-1 bg-surface-elevated border border-primary/50 rounded-lg px-3 py-1 text-sm outline-none text-text-main"
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
              <span className="flex-1 text-sm font-bold text-text-muted group-hover:text-text-main transition-colors">
                {cat.name}
              </span>
              <button
                onClick={() => handleStartEdit(cat)}
                className="opacity-0 group-hover:opacity-100 p-1.5 text-text-dark hover:text-primary transition-all"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => onDeleteCategory(cat.id)}
                className="opacity-0 group-hover:opacity-100 p-1.5 text-text-dark hover:text-rose-400 transition-all"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
        {/* Render Children */}
        {getChildren(cat.id).map((child) =>
          renderCategoryItem(child, level + 1),
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-lg bg-surface border border-border-muted rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[80vh] glass-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-border-muted flex items-center justify-between bg-surface-raised/50 shrink-0">
          <h2 className="text-xl font-black uppercase tracking-tight text-text-main italic">
            Manage <span className="text-primary text-glow">Categories</span>
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-text-dark hover:text-text-main transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 border-b border-border-muted bg-surface-raised/20 shrink-0">
          <form onSubmit={handleAddSubmit} className="flex gap-2">
            <div className="flex-1 flex gap-2">
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="New Category Name..."
                className="flex-1 bg-surface-raised border border-border-muted rounded-xl px-4 py-2 text-sm focus:border-primary outline-none transition-all placeholder:text-text-dark/50"
              />
              <select
                value={selectedParentId}
                onChange={(e) => setSelectedParentId(e.target.value)}
                className="w-1/3 bg-surface-raised border border-border-muted rounded-xl px-3 py-2 text-sm focus:border-primary outline-none cursor-pointer text-text-muted"
              >
                <option value="">No Parent</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={!newCategoryName.trim()}
              className="p-2 bg-primary hover:bg-primary-hover text-white rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-glow shadow-primary/10"
            >
              <Plus className="w-5 h-5" />
            </button>
          </form>
        </div>

        <div className="p-6 overflow-y-auto space-y-4 custom-scrollbar flex-1">
          {rootCategories.length === 0 ? (
            <div className="text-center text-slate-500 text-sm py-4">
              No categories yet. Add one above.
            </div>
          ) : (
            rootCategories.map((cat) => renderCategoryItem(cat))
          )}
        </div>

        <div className="p-6 bg-surface-raised/30 border-t border-border-subtle shrink-0">
          <p className="text-[10px] font-bold text-text-dark uppercase tracking-widest text-center italic">
            Deleting a category will NOT delete the series inside it.
          </p>
        </div>
      </div>
    </div>
  );
};

export default CategoryManagerModal;
