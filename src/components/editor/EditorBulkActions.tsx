"use client";

import { CheckSquare, Square, Trash2, X, Zap } from "lucide-react";
import React from "react";
import { ProcessedImage } from "../../types";
import { Button, IconButton, Mono, Select } from "../ui";

interface EditorBulkActionsProps {
  selectedCount: number;
  totalCount: number;
  isPageSelected: boolean;
  isBusy?: boolean;
  onTogglePage: () => void;
  onSelectAll: () => void;
  onClear: () => void;
  onStatusChange: (status: ProcessedImage["status"]) => void;
  onTranslate: () => void;
  onDelete: () => void;
}

/** Replaces the toolbar while pages are selected. */
const EditorBulkActions: React.FC<EditorBulkActionsProps> = ({
  selectedCount,
  totalCount,
  isPageSelected,
  isBusy = false,
  onTogglePage,
  onSelectAll,
  onClear,
  onStatusChange,
  onTranslate,
  onDelete,
}) => (
  <section
    aria-label="Selected pages"
    className="flex flex-wrap items-center gap-2 rounded-panel border border-action/50 bg-page px-2 py-1.5"
  >
    <IconButton
      label={isPageSelected ? "Unselect pages on this screen" : "Select pages on this screen"}
      active={isPageSelected}
      onClick={onTogglePage}
    >
      {isPageSelected ? <CheckSquare /> : <Square />}
    </IconButton>
    <Mono className="text-sm text-ink">
      {selectedCount} selected
    </Mono>
    <Button
      variant="ghost"
      size="sm"
      onClick={onSelectAll}
      disabled={selectedCount === totalCount}
    >
      Select all {totalCount}
    </Button>
    <IconButton label="Clear selection" size="sm" onClick={onClear}>
      <X />
    </IconButton>

    <div className="ml-auto flex flex-wrap items-center gap-2">
      <Select
        aria-label="Set status for selected pages"
        defaultValue=""
        disabled={isBusy}
        onChange={(event) => {
          const status = event.target.value as ProcessedImage["status"] | "";
          if (!status) return;
          onStatusChange(status);
          event.currentTarget.value = "";
        }}
        className="w-40"
      >
        <option value="">Set status…</option>
        <option value="idle">Mark not translated</option>
        <option value="completed">Mark ready</option>
        <option value="error">Mark failed</option>
      </Select>
      <Button variant="primary" icon={<Zap />} disabled={isBusy} onClick={onTranslate}>
        Translate selected
      </Button>
      <Button variant="danger" icon={<Trash2 />} disabled={isBusy} onClick={onDelete}>
        Delete
      </Button>
    </div>
  </section>
);

export default React.memo(EditorBulkActions);
