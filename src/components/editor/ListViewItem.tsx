"use client";

import {
  Check,
  MoreHorizontal,
  PencilRuler,
  Square,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import React from "react";
import { ProcessedImage } from "../../types";
import { cn } from "../../utils/cn";
import type { PageStatusView } from "../../utils/stages";
import { getThumbnailUrl } from "../../utils/url";
import { Button, IconButton, Menu, Mono, StageBar } from "../ui";

interface ListViewItemProps {
  image: ProcessedImage;
  status: PageStatusView;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  onOpen: () => void;
  onOpenEditor: () => void;
  onTranslate: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onSetStatus: (status: ProcessedImage["status"]) => void;
  readOnly?: boolean;
}

const toneText: Record<PageStatusView["tone"], string> = {
  neutral: "text-ink-3",
  accent: "text-action",
  ok: "text-ok",
  warn: "text-warn",
  danger: "text-shu",
};

/** One page as a compact row. */
const ListViewItem: React.FC<ListViewItemProps> = ({
  image,
  status,
  isSelected = false,
  onToggleSelect,
  onOpen,
  onOpenEditor,
  onTranslate,
  onCancel,
  onDelete,
  onSetStatus,
  readOnly = false,
}) => (
  <li
    className={cn(
      "flex items-center gap-3 rounded-panel border bg-page px-2 py-1.5 transition-colors duration-120",
      isSelected ? "border-action" : "border-line hover:border-ink-3",
    )}
  >
    {onToggleSelect && (
      <IconButton
        label={`${isSelected ? "Unselect" : "Select"} ${image.fileName}`}
        size="sm"
        active={isSelected}
        onClick={onToggleSelect}
      >
        {isSelected ? <Check /> : <Square />}
      </IconButton>
    )}

    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open ${image.fileName}`}
      className="h-14 w-10 shrink-0 cursor-zoom-in overflow-hidden rounded-chip bg-page-2"
    >
      <img
        src={getThumbnailUrl(image.originalKey, image.originalUrl, 120, 60)}
        alt=""
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover"
      />
    </button>

    <Mono className="w-12 shrink-0 text-xs text-ink-3">
      p.{String(image.sequenceNumber).padStart(3, "0")}
    </Mono>

    <span className="min-w-0 flex-1 truncate text-sm text-ink" title={image.fileName}>
      {image.fileName}
    </span>

    <StageBar stages={status.stages} size="sm" label={status.label} className="w-20 shrink-0" />

    <span
      className={cn("hidden w-32 shrink-0 truncate text-xs sm:block", toneText[status.tone])}
      title={status.error || status.label}
    >
      {status.label}
    </span>

    <Mono className="hidden w-16 shrink-0 text-right text-xs text-ink-3 md:block">
      {image.cost ? `$${image.cost.toFixed(4)}` : ""}
    </Mono>

    {!readOnly && (
      <div className="flex shrink-0 items-center gap-1">
        {status.active ? (
          <Button size="sm" icon={<X />} onClick={onCancel}>
            Cancel
          </Button>
        ) : (
          <Button
            size="sm"
            variant={image.status === "completed" ? "ghost" : "primary"}
            icon={<Zap />}
            onClick={onTranslate}
          >
            {image.status === "completed"
              ? "Re-translate"
              : status.tone === "danger"
                ? "Retry"
                : "Translate"}
          </Button>
        )}
        <IconButton
          label="Open layout editor"
          size="sm"
          disabled={status.active}
          onClick={onOpenEditor}
        >
          <PencilRuler />
        </IconButton>
        <Menu
          items={[
            { label: "Mark ready", onSelect: () => onSetStatus("completed") },
            { label: "Mark not translated", onSelect: () => onSetStatus("idle") },
            { label: "Mark failed", onSelect: () => onSetStatus("error") },
            {
              label: "Delete page",
              icon: <Trash2 />,
              onSelect: onDelete,
              danger: true,
              separator: true,
            },
          ]}
          trigger={(props) => (
            <IconButton label="More" size="sm" {...props}>
              <MoreHorizontal />
            </IconButton>
          )}
        />
      </div>
    )}
  </li>
);

export default React.memo(ListViewItem);
