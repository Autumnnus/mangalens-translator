"use client";

import {
  Check,
  ChevronLeft,
  ChevronRight,
  ImageOff,
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
import { formatInt } from "../../utils/format";
import { resolveImageUrl } from "../../utils/url";
import { Button, IconButton, Menu, Mono, StageBar } from "../ui";

interface Props {
  image: ProcessedImage;
  /** Position in the whole series (0-based). */
  index: number;
  total: number;
  status: PageStatusView;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  onOpen: () => void;
  onOpenEditor: () => void;
  onTranslate: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onSetStatus: (status: ProcessedImage["status"]) => void;
  onMove: (dir: "up" | "down" | "jump", targetPos?: number) => void;
  developerMode?: boolean;
  readOnly?: boolean;
  large?: boolean;
}

const toneText: Record<PageStatusView["tone"], string> = {
  neutral: "text-ink-3",
  accent: "text-action",
  ok: "text-ok",
  warn: "text-warn",
  danger: "text-shu",
};

const DeveloperMeta: React.FC<{ image: ProcessedImage }> = ({ image }) => {
  const usage = image.usage;
  if (!usage) return null;
  const processing = usage.processing;
  const rows: Array<[string, string]> = [
    [
      "Pipeline",
      processing ? `${processing.requestedPipeline} → ${processing.actualPipeline}` : "unknown",
    ],
    [
      "Detection",
      processing
        ? `${processing.detection.provider} · ${processing.detection.model}`
        : usage.modelUsed || "unknown",
    ],
    [
      "Translation",
      processing
        ? `${processing.translation.model} · ${processing.translation.inputMode}`
        : usage.modelUsed || "unknown",
    ],
    [
      "Tokens",
      `${formatInt(usage.promptTokenCount)} in · ${formatInt(usage.candidatesTokenCount)} out`,
    ],
    [
      "OCR",
      processing?.detection.durationMs
        ? `${formatInt(processing.detection.durationMs)} ms · ${processing.detection.regions || 0} regions`
        : "n/a",
    ],
    ["Fallback", processing?.translation.fallbackUsed ? "used" : "not used"],
  ];
  return (
    <details className="group rounded-control border border-line bg-page-2 text-xs">
      <summary className="cursor-pointer select-none px-2 py-1.5 text-ink-2 hover:text-ink">
        Developer details
        <Mono className="ml-2 text-ink-3" suppressHydrationWarning>
          {processing?.completedAt
            ? new Date(processing.completedAt).toLocaleTimeString()
            : "legacy"}
        </Mono>
      </summary>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-line px-2 py-2">
        {rows.map(([key, value]) => (
          <React.Fragment key={key}>
            <dt className="text-ink-3">{key}</dt>
            <dd className="min-w-0 break-words font-mono text-ink" title={value}>
              {value}
            </dd>
          </React.Fragment>
        ))}
        {(usage.breakdown || []).map((call, callIndex) => (
          <React.Fragment key={`${call.model}-${callIndex}`}>
            <dt className="text-ink-3">Call {callIndex + 1}</dt>
            <dd className="min-w-0 truncate font-mono text-ink" title={call.model}>
              {call.model} · {call.billingMode} · {formatInt(call.totalTokenCount)} tok
            </dd>
          </React.Fragment>
        ))}
        {processing?.detection.workerId && (
          <>
            <dt className="text-ink-3">Worker</dt>
            <dd className="min-w-0 truncate font-mono text-ink">
              {processing.detection.workerId} · {processing.detection.device || "unknown"}
            </dd>
          </>
        )}
      </dl>
    </details>
  );
};

/** One page in the editor grid. */
const ImageCard: React.FC<Props> = ({
  image,
  index,
  total,
  status,
  isSelected = false,
  onToggleSelect,
  onOpen,
  onOpenEditor,
  onTranslate,
  onCancel,
  onDelete,
  onSetStatus,
  onMove,
  developerMode = false,
  readOnly = false,
  large = false,
}) => {
  const [loadState, setLoadState] = React.useState<"loading" | "ready" | "error">("loading");
  const imgRef = React.useRef<HTMLImageElement>(null);
  const [sequenceInput, setSequenceInput] = React.useState(
    String(image.sequenceNumber),
  );

  const displayUrl = resolveImageUrl(image.translatedUrl || image.originalUrl);

  // A cached image can finish before React attaches onLoad; check it directly.
  React.useEffect(() => {
    const element = imgRef.current;
    if (!element) return;
    if (element.complete) {
      setLoadState(element.naturalWidth > 0 ? "ready" : "error");
    } else {
      setLoadState("loading");
    }
  }, [displayUrl]);

  React.useEffect(() => {
    setSequenceInput(String(image.sequenceNumber));
  }, [image.sequenceNumber]);

  const commitSequence = () => {
    const value = parseInt(sequenceInput, 10);
    if (Number.isNaN(value) || value === image.sequenceNumber) {
      setSequenceInput(String(image.sequenceNumber));
      return;
    }
    onMove("jump", value);
  };

  const translateLabel =
    image.status === "completed"
      ? "Re-translate"
      : status.tone === "danger"
        ? "Retry"
        : "Translate";

  return (
    <li
      className={cn(
        "group/card flex flex-col overflow-hidden rounded-panel border bg-page transition-colors duration-120",
        isSelected ? "border-action" : "border-line hover:border-ink-3",
      )}
    >
      <div className="relative aspect-[2/3] bg-page-2">
        <button
          type="button"
          onClick={onOpen}
          className="block h-full w-full cursor-zoom-in overflow-hidden focus-visible:outline-offset-[-2px]"
          aria-label={`Open ${image.fileName}`}
        >
          <img
            ref={imgRef}
            src={displayUrl}
            alt=""
            className={cn(
              "h-full w-full object-cover transition-opacity duration-200",
              loadState === "ready" ? "opacity-100" : "opacity-0",
            )}
            loading="lazy"
            decoding="async"
            onLoad={() => setLoadState("ready")}
            onError={() => setLoadState("error")}
          />
          {loadState === "error" && (
            <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-xs text-ink-3">
              <ImageOff aria-hidden="true" className="h-5 w-5" />
              Image unavailable
            </span>
          )}
        </button>

        {onToggleSelect && (
          <IconButton
            label={`${isSelected ? "Unselect" : "Select"} ${image.fileName}`}
            size="sm"
            variant="secondary"
            active={isSelected}
            onClick={onToggleSelect}
            className={cn(
              "absolute left-2 top-2 shadow-pop transition-opacity duration-120",
              isSelected
                ? "opacity-100"
                : "opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100",
            )}
          >
            {isSelected ? <Check /> : <Square />}
          </IconButton>
        )}

        {image.cost !== undefined && image.cost > 0 && (
          <Mono
            className="absolute right-2 top-2 rounded-chip border border-line bg-page px-1.5 py-0.5 text-xs text-ink-2"
            title="Translation cost"
          >
            ${image.cost.toFixed(4)}
          </Mono>
        )}
      </div>

      <div className="flex flex-col gap-2 p-3">
        <div className="flex items-baseline gap-2">
          <Mono className="shrink-0 text-xs text-ink-3">
            p.{String(index + 1).padStart(3, "0")}
          </Mono>
          <span className="min-w-0 truncate text-sm font-medium text-ink" title={image.fileName}>
            {image.fileName}
          </span>
        </div>

        <StageBar stages={status.stages} label={status.label} />

        <p className={cn("flex min-w-0 items-center gap-1.5 text-xs", toneText[status.tone])}>
          <span className="shrink-0 font-medium">{status.label}</span>
          {status.error && (
            <span className="min-w-0 truncate text-ink-3" title={status.error}>
              · {status.error}
            </span>
          )}
        </p>

        {developerMode && large && <DeveloperMeta image={image} />}

        {!readOnly && (
          <div className="flex flex-wrap items-center gap-1">
            {status.active ? (
              <Button size="sm" icon={<X />} onClick={onCancel} className="flex-1">
                Cancel
              </Button>
            ) : (
              <Button
                size="sm"
                variant={image.status === "completed" ? "secondary" : "primary"}
                icon={<Zap />}
                onClick={onTranslate}
                className="min-w-0 flex-1"
              >
                {translateLabel}
              </Button>
            )}
            <IconButton
              label="Open layout editor"
              size="sm"
              variant="secondary"
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
                <IconButton label="More" size="sm" variant="secondary" {...props}>
                  <MoreHorizontal />
                </IconButton>
              )}
            />
          </div>
        )}

        {!readOnly && (
          <div className="flex items-center justify-between gap-1 border-t border-line-2 pt-2">
            <IconButton
              label="Move earlier"
              size="sm"
              disabled={index === 0}
              onClick={() => onMove("up")}
            >
              <ChevronLeft />
            </IconButton>
            <label className="flex items-center gap-1 whitespace-nowrap text-xs text-ink-3">
              <span className="sr-only">Position</span>
              <input
                type="number"
                min={1}
                max={total}
                value={sequenceInput}
                onChange={(event) => setSequenceInput(event.target.value)}
                onFocus={(event) => event.target.select()}
                onBlur={commitSequence}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                  if (event.key === "Escape") {
                    setSequenceInput(String(image.sequenceNumber));
                    event.currentTarget.blur();
                  }
                }}
                aria-label={`Position of ${image.fileName}, 1 to ${total}`}
                className="no-spinner h-6 w-12 rounded-chip border border-transparent bg-transparent text-center font-mono text-xs tabular text-ink hover:border-line focus:border-action focus:outline-none"
              />
              <Mono>/ {total}</Mono>
            </label>
            <IconButton
              label="Move later"
              size="sm"
              disabled={index === total - 1}
              onClick={() => onMove("down")}
            >
              <ChevronRight />
            </IconButton>
          </div>
        )}
      </div>
    </li>
  );
};

export default React.memo(ImageCard);
