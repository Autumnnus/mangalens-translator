import { catalogModel } from "@/lib/aiCatalog";
import { LimitStatus, LimitWindow } from "@/lib/aiUsage";
import React from "react";
import { cn } from "../../utils/cn";
import { Chip, Mono, ProgressBar } from "../ui";
import { formatClock, formatRelative, formatReset, formatTokens, LIMIT_STATE, ROLE_LABEL } from "./format";

const WINDOW_LABEL: Record<NonNullable<LimitWindow["window"]>, string> = {
  minute: "Per minute",
  hour: "Per hour",
  day: "Per day",
  month: "Per month",
};

const windowText = (entry: LimitWindow) => {
  const amount = (value: number) => (entry.unit === "tokens" ? formatTokens(value) : String(value));
  const head = `${entry.window ? WINDOW_LABEL[entry.window] : "Window"}: `;
  const body =
    entry.remaining !== undefined && entry.limit !== undefined
      ? `${amount(entry.remaining)} of ${amount(entry.limit)} ${entry.unit} left`
      : entry.remaining !== undefined
        ? `${amount(entry.remaining)} ${entry.unit} left`
        : `limit ${amount(entry.limit!)} ${entry.unit}`;
  const reset =
    entry.resetAt && Date.parse(entry.resetAt) > Date.now() ? ` · resets ${formatRelative(entry.resetAt)}` : "";
  return head + body + reset;
};

export const modelLabel = (model: string) =>
  model === "*" ? "All free models (shared daily pool)" : catalogModel(model)?.label || model;

/** Today's standing of one model against its limits. */
const LimitMeter: React.FC<{ status: LimitStatus; compact?: boolean; className?: string }> = ({
  status,
  compact = false,
  className,
}) => {
  const state = LIMIT_STATE[status.state];
  const total = status.dayLimit !== undefined ? status.dayLimit * status.keys : undefined;
  const ratio = total ? status.usedToday / total : 0;
  const tone = status.state === "exhausted" ? "danger" : status.state === "near" || ratio >= 0.8 ? "warn" : "ok";
  // The server only sets exhaustedUntil while the reset is still ahead.
  const exhausted = !!status.exhaustedUntil;

  const usage =
    total !== undefined
      ? `${status.usedToday} of ${total} requests today`
      : `${status.usedToday} request${status.usedToday === 1 ? "" : "s"} today`;
  const details = [
    total !== undefined && status.keys > 1 ? `${status.dayLimit} per key × ${status.keys} keys` : "",
    total !== undefined
      ? status.dayLimitSource === "provider"
        ? "limit reported by the provider"
        : "typical free limit"
      : status.freeTier
        ? "no daily limit known"
        : "paid: billed per token",
    `day resets ${formatReset(status.dayResetsAt)}`,
  ].filter(Boolean);

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="min-w-0 truncate text-sm font-medium text-ink" title={status.model}>
          {modelLabel(status.model)}
        </span>
        {!compact && <span className="text-xs text-ink-3">{status.providerName}</span>}
        {!compact &&
          status.roles.map((role) => (
            <Chip key={role} size="sm" tone="neutral">
              {ROLE_LABEL[role]}
            </Chip>
          ))}
        <Chip size="sm" tone={state.tone} className="ml-auto">
          {state.label}
        </Chip>
      </div>
      {total !== undefined && <ProgressBar value={status.usedToday} max={total} tone={tone} label={usage} />}
      <Mono className="text-xs leading-relaxed text-ink-3">
        {usage}
        {status.tokensToday > 0 ? ` · ${formatTokens(status.tokensToday)} tokens` : ""} · {details.join(" · ")}
      </Mono>
      {exhausted && (
        <p className="text-xs leading-relaxed text-shu">
          The provider refuses new calls until {formatReset(status.exhaustedUntil!)} (
          {formatRelative(status.exhaustedUntil!)}). Pages use the fallback model meanwhile, if one is set.
        </p>
      )}
      {!compact &&
        status.windows.map((entry) => (
          <Mono key={`${entry.unit}-${entry.window}`} className="text-xs text-ink-3">
            {windowText(entry)}
          </Mono>
        ))}
      {!compact && status.lastError && status.lastErrorAt && (
        <p className="line-clamp-2 text-xs leading-relaxed text-ink-3" title={status.lastError}>
          Last problem at {formatClock(status.lastErrorAt)}: {status.lastError}
        </p>
      )}
    </div>
  );
};

export default LimitMeter;
