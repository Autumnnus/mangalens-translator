import { presetById } from "@/lib/aiCatalog";
import { LimitWindow, QuotaHit } from "@/lib/aiUsage";

/**
 * Reads what providers say about their limits: rate-limit response headers
 * (OpenAI, Groq, Mistral, OpenRouter, DeepSeek…) and quota errors (Gemini's
 * RESOURCE_EXHAUSTED details). Nothing here is authoritative; it is shown to
 * the user and used to stop hammering a key whose daily quota is gone.
 */

/** "1m30.5s", "6ms", "2h", "7.66s", "12" (seconds), epoch s/ms, ISO. Returns ms from now. */
export const parseResetMs = (value: string, now = Date.now()): number | undefined => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const number = Number(trimmed);
    if (number > 1e12) return Math.max(0, number - now); // epoch ms
    if (number > 1e9) return Math.max(0, number * 1000 - now); // epoch s
    return number * 1000; // seconds
  }
  const parts = [...trimmed.matchAll(/(\d+(?:\.\d+)?)(ms|h|m|s)/g)];
  if (parts.length > 0 && parts.map((part) => part[0]).join("") === trimmed.replace(/\s+/g, "")) {
    const unit = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 } as const;
    return parts.reduce((total, part) => total + Number(part[1]) * unit[part[2] as keyof typeof unit], 0);
  }
  const date = Date.parse(trimmed);
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined;
};

const windowOf = (suffix: string): LimitWindow["window"] | undefined => {
  if (/min/.test(suffix)) return "minute";
  if (/hour/.test(suffix)) return "hour";
  if (/day/.test(suffix)) return "day";
  if (/month/.test(suffix)) return "month";
  return undefined;
};

/**
 * Normalizes `x-ratelimit-{limit,remaining,reset}[-suffix]` headers. The
 * window is taken from the suffix when it names one; otherwise from what the
 * provider is known to mean (Groq: requests per day, tokens per minute;
 * OpenAI-style: per minute; OpenRouter: per minute for free models).
 */
export const parseRateLimitHeaders = (headers: Headers, preset: string, now = Date.now()): LimitWindow[] => {
  const windows = new Map<string, LimitWindow>();
  headers.forEach((value, rawName) => {
    const match = rawName.toLowerCase().match(/^x-ratelimit-(limit|remaining|reset)(?:-(.+))?$/);
    if (!match) return;
    const [, field, suffix = ""] = match;
    const unit: LimitWindow["unit"] = /tok/.test(suffix) ? "tokens" : "requests";
    const window = windowOf(suffix) ?? (preset === "groq" ? (unit === "requests" ? "day" : "minute") : "minute");
    const key = `${unit}:${window}`;
    const entry = windows.get(key) || { unit, window };
    if (field === "reset") {
      const ms = parseResetMs(value, now);
      if (ms !== undefined) entry.resetAt = new Date(now + ms).toISOString();
    } else {
      const number = Number(value);
      if (Number.isFinite(number) && number >= 0) entry[field as "limit" | "remaining"] = number;
    }
    windows.set(key, entry);
  });
  return [...windows.values()].filter((entry) => entry.limit !== undefined || entry.remaining !== undefined);
};

/** Wall-clock parts of `now` in a time zone. */
const zonedParts = (timeZone: string, now: Date) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
  return { hour: get("hour"), minute: get("minute"), second: get("second") };
};

/** Start of the provider's current quota day (Gemini: Pacific midnight, others UTC). */
export const quotaDayStart = (preset: string, now = new Date()) => {
  const timeZone = presetById(preset)?.quotaTimeZone || "UTC";
  const { hour, minute, second } = zonedParts(timeZone, now);
  const start = new Date(now.getTime() - ((hour * 60 + minute) * 60 + second) * 1000);
  start.setUTCMilliseconds(0);
  return start;
};

export const quotaDayEnd = (preset: string, now = new Date()) =>
  new Date(quotaDayStart(preset, now).getTime() + 24 * 3_600_000);

/**
 * Gemini quota errors carry google.rpc.QuotaFailure details, e.g.
 * quotaId "GenerateRequestsPerDayPerProjectPerModel-FreeTier", quotaValue "20",
 * and a RetryInfo delay that is meaningless for daily quotas.
 */
export const parseGeminiQuota = (message: string, now = new Date()): (QuotaHit & { retryMs?: number }) | undefined => {
  if (!/RESOURCE_EXHAUSTED|exceeded your current quota|quota/i.test(message)) return undefined;
  const quotaId = message.match(/"quotaId"\s*:\s*"([^"]+)"/)?.[1] || "";
  const value = Number(message.match(/"quotaValue"\s*:\s*"?(\d+)/)?.[1]);
  const delay = message.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/)?.[1];
  const retryMs = delay ? Number(delay) * 1000 : undefined;
  const scope: QuotaHit["scope"] = /PerDay/i.test(quotaId) ? "day" : /PerMinute/i.test(quotaId) ? "minute" : "unknown";
  const resetAt =
    scope === "day"
      ? quotaDayEnd("gemini", now).toISOString()
      : retryMs !== undefined
        ? new Date(now.getTime() + retryMs).toISOString()
        : undefined;
  return { scope, limit: Number.isFinite(value) ? value : undefined, resetAt, retryMs };
};

/**
 * OpenAI-compatible 429 bodies. OpenRouter's free pool says
 * "free-models-per-day"; others mention daily limits in prose.
 */
export const parseOpenAiQuota = (
  status: number,
  message: string,
  preset: string,
  windows: LimitWindow[],
  retryMs: number | undefined,
  now = new Date(),
): QuotaHit | undefined => {
  if (status !== 429 && !/quota|insufficient|balance/i.test(message)) return undefined;
  const daily =
    /per[-_ ]?day|daily|free-models-per-day|RPD/i.test(message) ||
    windows.some((entry) => entry.window === "day" && entry.remaining === 0);
  if (daily) {
    const dayWindow = windows.find((entry) => entry.window === "day");
    return {
      scope: "day",
      limit: dayWindow?.limit,
      resetAt: dayWindow?.resetAt || quotaDayEnd(preset, now).toISOString(),
    };
  }
  if (status === 429) {
    return {
      scope: "minute",
      resetAt: retryMs !== undefined ? new Date(now.getTime() + retryMs).toISOString() : undefined,
    };
  }
  return { scope: "unknown" };
};
