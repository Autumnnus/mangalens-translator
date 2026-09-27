/**
 * Shapes of the AI usage ledger as the client sees them. Isomorphic: the
 * server builds these from the `ai_calls` table and the usage screen and the
 * settings screen render them.
 */

export type AiStage = "reading" | "translation";

/** What happened to one model call. */
export type AiCallStatus = "ok" | "rate_limited" | "quota_exhausted" | "blocked" | "error";

/** One rate-limit window a provider reported (headers or a quota error). */
export interface LimitWindow {
  unit: "requests" | "tokens";
  window?: "minute" | "hour" | "day" | "month";
  limit?: number;
  remaining?: number;
  /** ISO time the window resets. */
  resetAt?: string;
}

/** A quota the provider said was exceeded. */
export interface QuotaHit {
  scope: "minute" | "day" | "unknown";
  limit?: number;
  /** ISO time the quota is expected to be available again. */
  resetAt?: string;
}

/** Stored with each call: what the provider told us about its limits. */
export interface CallLimits {
  windows?: LimitWindow[];
  quota?: QuotaHit;
}

export interface UsageTotals {
  calls: number;
  failed: number;
  pages: number;
  inputTokens: number;
  outputTokens: number;
  /** Estimated charge; calls on free-tier providers count as zero. */
  costUsd: number;
  /** What the free-tier calls would have cost at list price. */
  savedUsd: number;
}

export interface DailyUsage {
  /** YYYY-MM-DD (UTC). */
  date: string;
  calls: number;
  failed: number;
  pages: number;
  tokens: number;
  costUsd: number;
}

export interface ModelUsageRow {
  providerId: string;
  providerName: string;
  preset: string;
  model: string;
  stage: AiStage;
  calls: number;
  failed: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  savedUsd: number;
  avgDurationMs: number | null;
  lastUsedAt: string | null;
}

export type LimitState = "ok" | "near" | "exhausted" | "rate_limited" | "unknown";

/** Today's standing of one model (or one shared account pool) against its limits. */
export interface LimitStatus {
  providerId: string;
  providerName: string;
  preset: string;
  /** Model id, or "*" for a pool shared by all free models of the account. */
  model: string;
  /** Stages of the current setup that use this model. */
  roles: ("reader" | "translator" | "readerFallback" | "translatorFallback")[];
  freeTier: boolean;
  /** Requests made since the provider's daily reset. */
  usedToday: number;
  tokensToday: number;
  /** Daily request limit, if known. */
  dayLimit?: number;
  /** Where dayLimit comes from. */
  dayLimitSource?: "provider" | "catalog";
  /** Number of API keys the requests are spread over (each has its own quota). */
  keys: number;
  /** ISO time the provider's day resets. */
  dayResetsAt: string;
  /** Set while the provider refuses calls because the daily quota is used up. */
  exhaustedUntil?: string;
  state: LimitState;
  /** Latest windows the provider reported in response headers. */
  windows: LimitWindow[];
  windowsObservedAt?: string;
  lastError?: string;
  lastErrorAt?: string;
}

export interface RecentProblem {
  at: string;
  providerName: string;
  model: string;
  stage: AiStage;
  status: AiCallStatus;
  error: string;
}

export interface UsageSummary {
  generatedAt: string;
  /** False when the ledger table is not available yet. */
  tracking: boolean;
  /** When the ledger started recording for this account. */
  trackingSince: string | null;
  today: UsageTotals;
  week: UsageTotals;
  month: UsageTotals;
  /** From the pages themselves, including work done before the ledger existed. */
  lifetime: { pages: number; costUsd: number };
  daily: DailyUsage[];
  models: ModelUsageRow[];
  limits: LimitStatus[];
  /** How many more pages today's known limits allow with the current setup. */
  capacity: {
    pagesLeftToday: number | null;
    /** Model that runs out first. */
    limitedBy: string | null;
  };
  problems: RecentProblem[];
}

/** Result of checking a provider's keys against its API. */
export interface KeyCheck {
  keyHint: string;
  /** true valid, false rejected, null could not tell. */
  ok: boolean | null;
  message: string;
  /** Model ids the key can use, when the provider lists them. */
  models?: string[];
  account?: {
    /** OpenRouter: never bought credits. */
    freeTier?: boolean;
    /** OpenRouter: requests to free models today. */
    freeDaily?: { used: number; limit: number; remaining: number };
    /** Credits in USD: OpenRouter usage, DeepSeek balance. */
    creditsUsed?: number;
    creditsLimit?: number | null;
    balance?: string;
  };
}

export interface ProviderCheck {
  providerId: string;
  checkedAt: string;
  keys: KeyCheck[];
}

/** Masks a key for display and storage: "…a1B2". */
export const keyHint = (key: string) => `…${key.trim().slice(-4)}`;
