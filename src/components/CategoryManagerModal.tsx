import { Check, FolderTree, Pencil, Plus, Trash2, X } from "lucide-react";
import randomColor from "randomcolor";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Category } from "../types";
import {
  Button,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  Select,
} from "./ui";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  onUpdateCategory: (
    id: string,
    name: string,
    parentId?: string | null,
    color?: string,
  ) => void;
  onDeleteCategory: (id: string) => void;
  onAddCategory: (name: string, parentId?: string, color?: string) => void;
  initialParentId?: string;
}

const DEFAULT_COLOR = "#6366f1";
const getRandomColor = () => randomColor({ luminosity: "bright" });

const swatchClass =
  "h-8 w-8 shrink-0 cursor-pointer rounded-control border border-line bg-page-2 p-0.5 transition-colors duration-120 hover:border-ink-3 focus:border-action focus:outline-none focus:ring-2 focus:ring-action/30";

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
  const [editColor, setEditColor] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState(DEFAULT_COLOR);
  const [selectedParentId, setSelectedParentId] = useState<string>(
    initialParentId || "",
  );

  // Parents pass an inline `onClose`; keep a stable identity for the dialog
  // so its focus/escape effect does not re-run on every parent render.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  const handleClose = useCallback(() => onCloseRef.current(), []);

  React.useEffect(() => {
    if (isOpen) {
      setNewCategoryColor(getRandomColor());
      if (initialParentId) {
        setSelectedParentId(initialParentId);
      } else {
        setSelectedParentId("");
      }
    }
  }, [isOpen, initialParentId]);

  const rootCategories = useMemo(() => {
    const ids = new Set(categories.map((c) => c.id));
    return categories.filter((c) => !c.parentId || !ids.has(c.parentId));
  }, [categories]);

  const handleStartEdit = (cat: Category) => {
    setEditingId(cat.id);
    setEditValue(cat.name);
    setEditColor(cat.color || DEFAULT_COLOR);
  };

  const handleSaveEdit = (cat: Category) => {
    if (editValue.trim()) {
      onUpdateCategory(cat.id, editValue.trim(), cat.parentId, editColor);
    }
    setEditingId(null);
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newCategoryName.trim()) {
      onAddCategory(
        newCategoryName.trim(),
        selectedParentId === "" ? undefined : selectedParentId,
        newCategoryColor,
      );
      setNewCategoryName("");
      setNewCategoryColor(getRandomColor());
    }
  };

  const getChildren = (parentId: string) =>
    categories.filter((c) => c.parentId === parentId);

  const renderCategoryItem = (cat: Category, level: number = 0) => {
    const isEditing = editingId === cat.id;

    return (
      <React.Fragment key={cat.id}>
        <div
          className="group flex items-center gap-2.5 border-b border-line-2 px-3 py-2 transition-colors duration-120 hover:bg-page-2 focus-within:bg-page-2"
          style={
            level > 0 ? { paddingLeft: `${12 + level * 16}px` } : undefined
          }
        >
          {level > 0 && (
            <span aria-hidden="true" className="h-4 w-px shrink-0 bg-line-2" />
          )}
          {isEditing ? (
            <>
              <input
                type="color"
                aria-label="Category colour"
                value={editColor}
                onChange={(e) => setEditColor(e.target.value)}
                className={swatchClass}
              />
              <Input
                autoFocus
                type="text"
                aria-label="Category name"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSaveEdit(cat);
                  } else if (e.key === "Escape") {
                    e.stopPropagation();
                    setEditingId(null);
                  }
                }}
                className="min-w-0 flex-1"
              />
              <IconButton
                label="Save"
                variant="primary"
                onClick={() => handleSaveEdit(cat)}
              >
                <Check />
              </IconButton>
              <IconButton label="Cancel" onClick={() => setEditingId(null)}>
                <X />
              </IconButton>
            </>
          ) : (
            <>
              <span
                aria-hidden="true"
                className="h-3 w-3 shrink-0 rounded-full border border-line"
                style={{ backgroundColor: cat.color || DEFAULT_COLOR }}
              />
              <span className="min-w-0 flex-1 truncate text-sm text-ink">
                {cat.name}
              </span>
              <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-120 group-hover:opacity-100 group-focus-within:opacity-100">
                <IconButton
                  label="Edit"
                  size="sm"
                  onClick={() => handleStartEdit(cat)}
                >
                  <Pencil />
                </IconButton>
                <IconButton
                  label="Delete"
                  size="sm"
                  variant="danger"
                  onClick={() => onDeleteCategory(cat.id)}
                >
                  <Trash2 />
                </IconButton>
              </span>
            </>
          )}
        </div>
        {getChildren(cat.id).map((child) =>
          renderCategoryItem(child, level + 1),
        )}
      </React.Fragment>
    );
  };

  return (
    <Modal
      open={isOpen}
      onClose={handleClose}
      size="lg"
      title="Categories"
      flush
    >
      <form
        onSubmit={handleAddSubmit}
        className="flex flex-col gap-3 border-b border-line px-5 py-4"
      >
        <div className="flex items-end gap-2">
          {/* Name comes first in the DOM so the dialog focuses it; the swatch is placed first visually. */}
          <Field label="Name" className="min-w-0 flex-1">
            {({ id }) => (
              <Input
                id={id}
                data-autofocus
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Category name"
              />
            )}
          </Field>
          <input
            type="color"
            aria-label="New category colour"
            value={newCategoryColor}
            onChange={(e) => setNewCategoryColor(e.target.value)}
            className={`${swatchClass} order-first`}
          />
          <Field label="Parent" className="w-40 shrink-0">
            {({ id }) => (
              <Select
                id={id}
                value={selectedParentId}
                onChange={(e) => setSelectedParentId(e.target.value)}
              >
                <option value="">None</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Button
            type="submit"
            variant="primary"
            icon={<Plus />}
            disabled={!newCategoryName.trim()}
          >
            Add
          </Button>
        </div>
      </form>

      {rootCategories.length === 0 ? (
        <div className="p-5">
          <EmptyState
            icon={<FolderTree />}
            title="No categories yet"
            description="Add a category above to group your series."
          />
        </div>
      ) : (
        <div className="flex flex-col">
          {rootCategories.map((cat: Category) => renderCategoryItem(cat))}
        </div>
      )}
    </Modal>
  );
};

export default CategoryManagerModal;
