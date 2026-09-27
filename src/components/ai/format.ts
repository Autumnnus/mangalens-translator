import { AiCallStatus, AiStage, LimitState, LimitStatus } from "@/lib/aiUsage";
import type { ChipTone } from "../ui";

/** Display helpers shared by the usage and settings screens. */

export const formatUsd = (usd: number) => {
  if (usd === 0) return "$0";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 10) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
};

export const formatPageCost = (usd: number) =>
  usd === 0 ? "free" : usd < 0.001 ? "< $0.001" : `$${usd.toFixed(usd < 0.01 ? 4 : 3)}`;

export const formatTokens = (tokens: number) => {
  if (tokens < 1000) return String(tokens);
  if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(tokens < 10_000 ? 1 : 0)}k`;
  if (tokens < 1_000_000_000) return `${(tokens / 1_000_000).toFixed(2)}M`;
  return `${(tokens / 1_000_000_000).toFixed(2)}B`;
};

export const formatDuration = (ms: number | null) =>
  ms === null ? "–" : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;

export const formatClock = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

export const formatDay = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });

/** "in 3 h", "in 12 min", "5 min ago". */
export const formatRelative = (iso: string, now = Date.now()) => {
  const diff = Date.parse(iso) - now;
  const minutes = Math.round(Math.abs(diff) / 60_000);
  const text = minutes < 1 ? "<1 min" : minutes < 90 ? `${minutes} min` : `${Math.round(minutes / 60)} h`;
  return diff >= 0 ? `in ${text}` : `${text} ago`;
};

/** When a reset is today, the clock time; otherwise the date too. */
export const formatReset = (iso: string) => {
  const date = new Date(iso);
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? formatClock(iso)
    : date.toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });
};

export const STAGE_LABEL: Record<AiStage, string> = { reading: "Reading", translation: "Translation" };

export const ROLE_LABEL: Record<LimitStatus["roles"][number], string> = {
  reader: "Reading",
  translator: "Translation",
  readerFallback: "Reading fallback",
  translatorFallback: "Translation fallback",
};

export const STATUS_LABEL: Record<AiCallStatus, string> = {
  ok: "OK",
  rate_limited: "Rate limited",
  quota_exhausted: "Quota used up",
  blocked: "Refused",
  error: "Error",
};

export const STATUS_TONE: Record<AiCallStatus, ChipTone> = {
  ok: "ok",
  rate_limited: "warn",
  quota_exhausted: "danger",
  blocked: "warn",
  error: "danger",
};

export const LIMIT_STATE: Record<LimitState, { label: string; tone: ChipTone }> = {
  ok: { label: "Available", tone: "ok" },
  near: { label: "Almost used up", tone: "warn" },
  exhausted: { label: "Used up", tone: "danger" },
  rate_limited: { label: "Slowed down", tone: "warn" },
  unknown: { label: "Not used yet", tone: "neutral" },
};
