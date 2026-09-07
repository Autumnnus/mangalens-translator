import { SlidersHorizontal } from "lucide-react";
import React, { useId, useState } from "react";
import { Button, Checkbox, Field, Input, Modal, Select } from "./ui";

export interface FilterSortOptions {
  search: string;
  categories: string[];
  sortBy:
    | "sequence"
    | "name-asc"
    | "name-desc"
    | "newest"
    | "oldest"
    | "most-images"
    | "least-images";
  showCompleted: boolean;
  showInProgress: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  availableCategories: { id: string; name: string }[];
  currentFilters: FilterSortOptions;
  onApply: (filters: FilterSortOptions) => void;
}

const SORT_OPTIONS: Array<{ value: FilterSortOptions["sortBy"]; label: string }> = [
  { value: "sequence", label: "Sequence" },
  { value: "name-asc", label: "Name (A–Z)" },
  { value: "name-desc", label: "Name (Z–A)" },
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "most-images", label: "Most pages" },
  { value: "least-images", label: "Least pages" },
];

const legendClass = "text-[13px] font-medium text-ink-2";

const FilterSortModal: React.FC<Props> = ({
  isOpen,
  onClose,
  availableCategories,
  currentFilters,
  onApply,
}) => {
  const [filters, setFilters] = useState<FilterSortOptions>(currentFilters);
  const formId = useId();

  const handleApply = (event?: React.FormEvent) => {
    event?.preventDefault();
    onApply(filters);
    onClose();
  };

  const handleReset = () => {
    const resetFilters: FilterSortOptions = {
      search: "",
      categories: [],
      sortBy: "sequence",
      showCompleted: true,
      showInProgress: true,
    };
    setFilters(resetFilters);
    onApply(resetFilters);
  };

  const toggleCategory = (id: string, checked: boolean) => {
    setFilters((current) => ({
      ...current,
      categories: checked
        ? [...current.categories, id]
        : current.categories.filter((categoryId) => categoryId !== id),
    }));
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      size="md"
      title="Filter and sort"
      icon={<SlidersHorizontal />}
      footer={
        <>
          <Button variant="secondary" onClick={handleReset}>
            Reset
          </Button>
          <Button variant="primary" type="submit" form={formId}>
            Apply
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleApply} className="flex flex-col gap-4">
        <Field label="Search">
          {({ id }) => (
            <Input
              id={id}
              type="search"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              placeholder="Series name"
              data-autofocus
            />
          )}
        </Field>

        <fieldset className="flex flex-col gap-1.5">
          <legend className={legendClass}>Categories</legend>
          {availableCategories.length === 0 ? (
            <p className="text-xs text-ink-3">No categories yet.</p>
          ) : (
            <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-control border border-line bg-page-2 p-2">
              {availableCategories.map((cat) => (
                <Checkbox
                  key={cat.id}
                  label={cat.name}
                  checked={filters.categories.includes(cat.id)}
                  onChange={(e) => toggleCategory(cat.id, e.target.checked)}
                  className="rounded-control px-1 py-1 hover:bg-page"
                />
              ))}
            </div>
          )}
        </fieldset>

        <Field label="Sort by">
          {({ id }) => (
            <Select
              id={id}
              value={filters.sortBy}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  sortBy: e.target.value as FilterSortOptions["sortBy"],
                })
              }
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <fieldset className="flex flex-col gap-2">
          <legend className={`${legendClass} mb-1.5`}>Status</legend>
          <Checkbox
            label="Show completed"
            checked={filters.showCompleted}
            onChange={(e) =>
              setFilters({ ...filters, showCompleted: e.target.checked })
            }
          />
          <Checkbox
            label="Show in progress"
            checked={filters.showInProgress}
            onChange={(e) =>
              setFilters({ ...filters, showInProgress: e.target.checked })
            }
          />
        </fieldset>
      </form>
    </Modal>
  );
};

export default FilterSortModal;
