import { Plus } from "lucide-react";
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
  Checkbox,
  Field,
  IconButton,
  Input,
  Modal,
  Select,
} from "./ui";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (
    name: string,
    category: string,
    categoryId?: string,
    metadata?: {
      author?: string;
      group?: string;
      originalTitle?: string;
      contentMode?: "standard" | "adult_verified";
    },
  ) => void;
  existingTitles: string[];
  categories: Category[];
  onAddCategory: (name: string) => void;
  initialName?: string;
  initialCategory?: string;
  initialCategoryId?: string;
  initialAuthor?: string;
  initialGroup?: string;
  initialOriginalTitle?: string;
  initialContentMode?: "standard" | "adult_verified";
}

const FORM_ID = "series-form";

const NewSeriesModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onConfirm,
  existingTitles,
  categories,
  onAddCategory,
  initialName = "",
  initialCategory = "",
  initialCategoryId,
  initialAuthor = "",
  initialGroup = "",
  initialOriginalTitle = "",
  initialContentMode = "standard",
}) => {
  const [name, setName] = useState(initialName);
  const [categoryName, setCategoryName] = useState(
    initialCategory ||
      (categories.length > 0 ? categories[0].name : "Uncategorized"),
  );
  const [author, setAuthor] = useState(initialAuthor);
  const [group, setGroup] = useState(initialGroup);
  const [originalTitle, setOriginalTitle] = useState(initialOriginalTitle);
  const [adultVerified, setAdultVerified] = useState(
    initialContentMode === "adult_verified",
  );
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [error, setError] = useState("");

  // Parents pass an inline `onClose`; keep a stable identity for the dialog
  // so its focus/escape effect does not re-run on every parent render.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  const handleClose = useCallback(() => onCloseRef.current(), []);

  // Sync state with props when opening for edit
  React.useEffect(() => {
    if (isOpen) {
      setName(initialName);

      // When initialCategoryId is given, select that category
      if (initialCategoryId) {
        const cat = categories.find((c) => c.id === initialCategoryId);
        if (cat) {
          setCategoryName(cat.name);
        }
      } else {
        setCategoryName(
          initialCategory ||
            (categories.length > 0 ? categories[0].name : "Uncategorized"),
        );
      }

      setAuthor(initialAuthor);
      setGroup(initialGroup);
      setOriginalTitle(initialOriginalTitle);
      setAdultVerified(initialContentMode === "adult_verified");
    }
  }, [
    isOpen,
    initialName,
    initialCategory,
    initialCategoryId,
    initialAuthor,
    initialGroup,
    initialOriginalTitle,
    initialContentMode,
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

    onConfirm(name.trim(), categoryName, selectedCategory?.id, {
      author,
      group,
      originalTitle,
      contentMode: adultVerified ? "adult_verified" : "standard",
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
      depth = 0,
    ): { id: string; name: string; level: number }[] => {
      const children = categories.filter(
        (c) => c.parentId === (parentId || null),
      );
      let list: { id: string; name: string; level: number }[] = [];
      children.forEach((child) => {
        list.push({ id: child.id, name: child.name, level: depth });
        list = list.concat(buildList(child.id, depth + 1));
      });
      return list;
    };
    const ids = new Set(categories.map((c) => c.id));
    const roots = categories.filter((c) => !c.parentId || !ids.has(c.parentId));
    let result: { id: string; name: string; level: number }[] = [];
    roots.forEach((r) => {
      result.push({ id: r.id, name: r.name, level: 0 });
      result = result.concat(buildList(r.id, 1));
    });
    return result;
  }, [categories]);

  const editing = Boolean(initialName);

  return (
    <Modal
      open={isOpen}
      onClose={handleClose}
      size="md"
      title={editing ? "Edit series" : "New series"}
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} data-dismiss>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={FORM_ID}>
            {editing ? "Save changes" : "Create series"}
          </Button>
        </>
      }
    >
      <form
        id={FORM_ID}
        onSubmit={handleSubmit}
        className="flex flex-col gap-4"
      >
        <Field label="Title" required error={error || undefined}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              data-autofocus
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError("");
              }}
              placeholder="e.g. One Piece, chapter 1100"
            />
          )}
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Author">
            {({ id }) => (
              <Input
                id={id}
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="Author name"
              />
            )}
          </Field>
          <Field label="Group">
            {({ id }) => (
              <Input
                id={id}
                type="text"
                value={group}
                onChange={(e) => setGroup(e.target.value)}
                placeholder="Scan group"
              />
            )}
          </Field>
        </div>

        <Field label="Original title">
          {({ id }) => (
            <Input
              id={id}
              type="text"
              value={originalTitle}
              onChange={(e) => setOriginalTitle(e.target.value)}
              placeholder="Original series title"
            />
          )}
        </Field>

        <Checkbox
          checked={adultVerified}
          onChange={(event) => setAdultVerified(event.target.checked)}
          label="Verified adult content"
          description="I confirm that the sexual content in this series depicts adults only. Local OCR safety fallback stays disabled for standard or age-ambiguous content."
        />

        {!isAddingCategory ? (
          <Field label="Category">
            {({ id }) => (
              <div className="flex items-start gap-2">
                <Select
                  id={id}
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  className="min-w-0 flex-1"
                >
                  <option value="">Uncategorized</option>
                  {flattenedCategories.map((cat) => (
                    <option key={cat.id} value={cat.name}>
                      {"  ".repeat(cat.level) +
                        (cat.level > 0 ? "└ " : "") +
                        cat.name}
                    </option>
                  ))}
                </Select>
                <IconButton
                  label="Add category"
                  variant="secondary"
                  onClick={() => setIsAddingCategory(true)}
                >
                  <Plus />
                </IconButton>
              </div>
            )}
          </Field>
        ) : (
          <Field label="New category">
            {({ id }) => (
              <div className="flex items-start gap-2">
                <Input
                  id={id}
                  type="text"
                  autoFocus
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddCategory();
                    }
                  }}
                  placeholder="Category name"
                  className="min-w-0 flex-1"
                />
                <Button
                  variant="primary"
                  size="sm"
                  className="h-8"
                  onClick={handleAddCategory}
                  disabled={!newCategoryName.trim()}
                >
                  Add
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8"
                  onClick={() => {
                    setIsAddingCategory(false);
                    setNewCategoryName("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            )}
          </Field>
        )}
      </form>
    </Modal>
  );
};

export default NewSeriesModal;
