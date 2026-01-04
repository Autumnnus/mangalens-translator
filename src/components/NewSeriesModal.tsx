import { Plus, X } from "lucide-react";
import React, { useMemo, useState } from "react";
import { Category } from "../types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (
    name: string,
    category: string,
    sequenceNumber: number,
    categoryId?: string,
    metadata?: { author?: string; group?: string; originalTitle?: string }
  ) => void;
  existingTitles: string[];
  categories: Category[];
  onAddCategory: (name: string) => void;
  initialName?: string;
  initialCategory?: string;
  initialSequenceNumber?: number;
  initialAuthor?: string;
  initialGroup?: string;
  initialOriginalTitle?: string;
}

const NewSeriesModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onConfirm,
  existingTitles,
  categories,
  onAddCategory,
  initialName = "",
  initialCategory = "",
  initialSequenceNumber = 0,
  initialAuthor = "",
  initialGroup = "",
  initialOriginalTitle = "",
}) => {
  const [name, setName] = useState(initialName);
  const [categoryName, setCategoryName] = useState(
    initialCategory ||
      (categories.length > 0 ? categories[0].name : "Uncategorized")
  );
  const [sequenceNumber, setSequenceNumber] = useState(initialSequenceNumber);
  const [author, setAuthor] = useState(initialAuthor);
  const [group, setGroup] = useState(initialGroup);
  const [originalTitle, setOriginalTitle] = useState(initialOriginalTitle);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [error, setError] = useState("");

  // Sync state with props when opening for edit
  React.useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setCategoryName(
        initialCategory ||
          (categories.length > 0 ? categories[0].name : "Uncategorized")
      );
      setSequenceNumber(initialSequenceNumber);
      setAuthor(initialAuthor);
      setGroup(initialGroup);
      setOriginalTitle(initialOriginalTitle);
    }
  }, [
    isOpen,
    initialName,
    initialCategory,
    initialSequenceNumber,
    initialAuthor,
    initialGroup,
    initialOriginalTitle,
    categories,
  ]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Title is required");
      return;
    }

    if (existingTitles.includes(name.trim()) && name.trim() !== initialName) {
      setError("A series with this title already exists");
      return;
    }

    const selectedCategory = categories.find((c) => c.name === categoryName);

    onConfirm(name.trim(), categoryName, sequenceNumber, selectedCategory?.id, {
      author,
      group,
      originalTitle,
    });
    setName("");
    onClose();
  };

  const handleAddCategory = () => {
    if (
      newCategoryName.trim() &&
      !categories.some((c) => c.name === newCategoryName.trim())
    ) {
      onAddCategory(newCategoryName.trim());
      setCategoryName(newCategoryName.trim());
      setNewCategoryName("");
      setIsAddingCategory(false);
    }
  };

  const flattenedCategories = useMemo(() => {
    const buildList = (
      parentId: string | null = null,
      depth = 0
    ): { id: string; name: string; level: number }[] => {
      const children = categories.filter(
        (c) => c.parentId === (parentId || null)
      );
      let list: { id: string; name: string; level: number }[] = [];
      children.forEach((child) => {
        list.push({ id: child.id, name: child.name, level: depth });
        list = list.concat(buildList(child.id, depth + 1));
      });
      return list;
    };
    const roots = categories.filter((c) => !c.parentId);
    let result: { id: string; name: string; level: number }[] = [];
    roots.forEach((r) => {
      result.push({ id: r.id, name: r.name, level: 0 });
      result = result.concat(buildList(r.id, 1));
    });
    return result;
  }, [categories]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-800/50">
          <h2 className="text-xl font-black uppercase tracking-tight text-white italic">
            {initialName ? "Edit" : "Create"}{" "}
            <span className="text-indigo-400">
              {initialName ? "Series" : "New Series"}
            </span>
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
              Series Title
            </label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., One Piece - Chapter 1100"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
            />
            {error && (
              <p className="text-xs font-bold text-rose-500 mt-1">{error}</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
              Sequence Number
            </label>
            <input
              type="number"
              value={sequenceNumber}
              onChange={(e) => setSequenceNumber(parseInt(e.target.value) || 0)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                Author
              </label>
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="Author name"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                Group
              </label>
              <input
                type="text"
                value={group}
                onChange={(e) => setGroup(e.target.value)}
                placeholder="Scan group"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
              Original Title
            </label>
            <input
              type="text"
              value={originalTitle}
              onChange={(e) => setOriginalTitle(e.target.value)}
              placeholder="Original series title"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
              Category
            </label>
            {!isAddingCategory ? (
              <div className="flex gap-2">
                <select
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all appearance-none cursor-pointer"
                >
                  <option value="">Select or Uncategorized</option>
                  {flattenedCategories.map((cat) => (
                    <option key={cat.id} value={cat.name}>
                      {"\u00A0\u00A0".repeat(cat.level) +
                        (cat.level > 0 ? "└ " : "") +
                        cat.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setIsAddingCategory(true)}
                  className="p-3 bg-slate-800 border border-slate-700 rounded-xl text-slate-400 hover:text-indigo-400 hover:border-indigo-500/30 transition-all"
                  title="Add new category"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <div className="flex gap-2 animate-in slide-in-from-right-2 duration-200">
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="New Category..."
                  className="flex-1 bg-slate-800 border border-indigo-500/50 rounded-xl px-4 py-3 text-sm outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={handleAddCategory}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-500 transition-all"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddingCategory(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-400 rounded-xl text-xs font-black uppercase tracking-widest hover:text-white transition-all"
                >
                  Back
                </button>
              </div>
            )}
          </div>

          <div className="pt-4">
            <button
              type="submit"
              className="w-full py-4 bg-gradient-to-r from-indigo-600 to-indigo-500 text-white rounded-2xl text-xs font-black uppercase tracking-[0.2em] shadow-xl shadow-indigo-500/20 hover:shadow-indigo-500/40 hover:-translate-y-0.5 active:translate-y-0 transition-all"
            >
              {initialName ? "Confirm Changes" : "Initialize Series"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NewSeriesModal;
