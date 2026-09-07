"use client";

import {
  ArrowLeftRight,
  CheckSquare,
  LayoutGrid,
  List,
  MoreHorizontal,
  Square,
  Trash2,
  Upload,
  Zap,
} from "lucide-react";
import React, { useRef } from "react";
import { Button, Chip, IconButton, Menu, SegmentedControl, Select } from "../ui";

export type ViewMode = "grid" | "list" | "large";
export type PageFilter = "all" | "running" | "failed" | "done" | "idle";

export interface PageCounts {
  all: number;
  running: number;
  failed: number;
  done: number;
  idle: number;
}

interface EditorToolbarProps {
  counts: PageCounts;
  filter: PageFilter;
  onFilterChange: (filter: PageFilter) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  isProcessingAll: boolean;
  canTranslateAll: boolean;
  onTranslateAll: () => void;
  batchSize: number;
  onBatchSizeChange: (size: number) => void;
  onUpload: (files: FileList | null) => void;
  isUploading: boolean;
  /** v1 pages plus migrated pages awaiting review. */
  migrationCount: number;
  onOpenMigration: () => void;
  onWipe: () => void;
  onSelectPage: () => void;
  isViewOnly: boolean;
}

const FILTERS: Array<{ id: PageFilter; label: string; tone: "neutral" | "accent" | "ok" | "warn" | "danger" }> = [
  { id: "all", label: "All", tone: "neutral" },
  { id: "running", label: "Running", tone: "accent" },
  { id: "failed", label: "Failed", tone: "danger" },
  { id: "done", label: "Ready", tone: "ok" },
  { id: "idle", label: "Not translated", tone: "neutral" },
];

/** Filters, view switch and the series-level actions for the editor. */
const EditorToolbar: React.FC<EditorToolbarProps> = ({
  counts,
  filter,
  onFilterChange,
  viewMode,
  onViewModeChange,
  isProcessingAll,
  canTranslateAll,
  onTranslateAll,
  batchSize,
  onBatchSizeChange,
  onUpload,
  isUploading,
  migrationCount,
  onOpenMigration,
  onWipe,
  onSelectPage,
  isViewOnly,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-panel border border-line bg-page px-2 py-1.5">
      {!isViewOnly && (
        <IconButton label="Select pages on this screen" onClick={onSelectPage}>
          <Square />
        </IconButton>
      )}

      <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filter pages">
        {FILTERS.map((item) => {
          const count = counts[item.id];
          if (item.id !== "all" && count === 0 && filter !== item.id) return null;
          return (
            <Chip
              key={item.id}
              tone={item.tone}
              active={filter === item.id}
              onClick={() => onFilterChange(item.id)}
              count={count}
            >
              {item.label}
            </Chip>
          );
        })}
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <SegmentedControl
          label="View"
          size="sm"
          value={viewMode}
          onChange={onViewModeChange}
          options={[
            { value: "grid", icon: <LayoutGrid />, title: "Grid" },
            { value: "large", icon: <CheckSquare />, title: "Large cards" },
            { value: "list", icon: <List />, title: "List" },
          ]}
        />

        {!isViewOnly && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf"
              className="hidden"
              onChange={(event) => {
                onUpload(event.target.files);
                event.target.value = "";
              }}
            />
            <Button
              icon={<Upload />}
              loading={isUploading}
              onClick={() => fileInputRef.current?.click()}
            >
              Add pages
            </Button>

            <div className="flex items-center">
              <Button
                variant="primary"
                icon={<Zap />}
                loading={isProcessingAll}
                disabled={!canTranslateAll}
                onClick={onTranslateAll}
                className="rounded-r-none"
                title={
                  canTranslateAll
                    ? "Queue every page that is not translated yet"
                    : "Every page is already translated"
                }
              >
                {isProcessingAll ? "Translating…" : "Translate all"}
              </Button>
              <Select
                aria-label="Batch size"
                title="Pages per batch"
                selectSize="md"
                value={batchSize}
                onChange={(event) => onBatchSizeChange(Number(event.target.value))}
                className="w-[4.75rem] [&>select]:rounded-l-none [&>select]:border-l-0"
              >
                {[...Array(10)].map((_, index) => (
                  <option key={index + 1} value={index + 1}>
                    ×{index + 1}
                  </option>
                ))}
              </Select>
            </div>

            <Menu
              items={[
                ...(migrationCount > 0
                  ? [
                      {
                        label: `Review migration (${migrationCount})`,
                        icon: <ArrowLeftRight />,
                        onSelect: onOpenMigration,
                      },
                    ]
                  : []),
                {
                  label: "Delete all pages",
                  icon: <Trash2 />,
                  onSelect: onWipe,
                  danger: true,
                  separator: migrationCount > 0,
                },
              ]}
              trigger={(props) => (
                <IconButton label="More actions" variant="secondary" {...props}>
                  <MoreHorizontal />
                </IconButton>
              )}
            />
          </>
        )}
      </div>
    </div>
  );
};

export default React.memo(EditorToolbar);
