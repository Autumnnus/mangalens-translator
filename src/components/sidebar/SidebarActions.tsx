import { Plus, Search, SlidersHorizontal, X } from "lucide-react";
import React from "react";
import { Button, Chip, IconButton, Input } from "../ui";

interface SidebarActionsProps {
  onAdd: () => void;
  onOpenFilter: () => void;
  search: string;
  onSearchChange: (search: string) => void;
  activeFilterCount: number;
  onClearFilters: () => void;
  isSidebarCollapsed: boolean;
  isViewOnly?: boolean;
}

const SidebarActions: React.FC<SidebarActionsProps> = ({
  onAdd,
  onOpenFilter,
  search,
  onSearchChange,
  activeFilterCount,
  onClearFilters,
  isSidebarCollapsed,
  isViewOnly = false,
}) => {
  if (isSidebarCollapsed) {
    return (
      <div className="flex shrink-0 flex-col items-center gap-1 border-b border-line py-2">
        {!isViewOnly && (
          <IconButton label="New series" variant="primary" onClick={onAdd}>
            <Plus />
          </IconButton>
        )}
        <IconButton
          label={
            activeFilterCount > 0
              ? `Filter & sort (${activeFilterCount} active)`
              : "Filter & sort"
          }
          variant="secondary"
          active={activeFilterCount > 0}
          onClick={onOpenFilter}
        >
          <SlidersHorizontal />
        </IconButton>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 flex-col gap-2 border-b border-line p-2">
      {!isViewOnly && (
        <Button variant="primary" full icon={<Plus />} onClick={onAdd}>
          New series
        </Button>
      )}

      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-2.5 my-auto h-4 w-4 text-ink-3"
        />
        <Input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search series"
          aria-label="Search series"
          className="pl-8 pr-8"
        />
        {search && (
          <IconButton
            label="Clear search"
            size="sm"
            className="absolute inset-y-0 right-0.5 my-auto"
            onClick={() => onSearchChange("")}
          >
            <X />
          </IconButton>
        )}
      </div>

      <Button
        variant="secondary"
        full
        icon={<SlidersHorizontal />}
        onClick={onOpenFilter}
      >
        Filter & sort
        {activeFilterCount > 0 && (
          <Chip size="sm" tone="accent">
            {activeFilterCount}
          </Chip>
        )}
      </Button>

      {activeFilterCount > 0 && (
        <Button variant="ghost" size="sm" full icon={<X />} onClick={onClearFilters}>
          Clear filters
        </Button>
      )}
    </div>
  );
};

export default React.memo(SidebarActions);
