import { AsyncLocalStorage } from "node:async_hooks";
import { catalogModel, presetById } from "@/lib/aiCatalog";
import { AiCallStatus, AiStage, CallLimits, keyHint } from "@/lib/aiUsage";
import { AiModelChoice, AiProviderConfig, AiSettings, UsageBreakdown } from "@/types";
import { callGemini } from "./gemini";
import { callOpenAiCompatible } from "./openai";
import { providerBaseUrl, providerKeys } from "./settings";
import { isRetryable, ModelCallError, ModelRequest, ModelUsage } from "./types";

/**
 * Runs one model call for a pipeline stage: picks the provider, rotates its
 * keys past rate limits, retries transient failures with backoff and falls
 * back to a second model when one is configured. Every attempt's usage is
 * recorded, including failed ones, because providers bill them.
 *
 * A key whose daily quota is used up is parked until the provider's reset
 * instead of being retried, so a page moves to the fallback model at once.
 */

const globalState = globalThis as unknown as {
  __modelCallState?: { cooldowns: Map<string, number>; exhausted: Map<string, number> };
};
const state =
  globalState.__modelCallState ||
  (globalState.__modelCallState = { cooldowns: new Map(), exhausted: new Map() });
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** One finished attempt, reported to whoever is tracking calls (the usage ledger). */
export interface ModelCallEvent {
  stage: AiStage;
  providerId: string;
  providerName: string;
  preset: string;
  freeTier: boolean;
  model: string;
  keyHint: string;
  status: AiCallStatus;
  error?: string;
  usage: ModelUsage;
  /** Charged estimate: zero on free-tier providers. */
  costUsd: number;
  /** List price of the same call. */
  listCostUsd: number;
  durationMs: number;
  limits?: CallLimits;
}

export type ModelCallObserver = (event: ModelCallEvent) => void;

const tracking = new AsyncLocalStorage<ModelCallObserver>();

/** Reports every model call made inside `fn` to `observer`. */
export const trackModelCalls = <T>(observer: ModelCallObserver, fn: () => Promise<T>) => tracking.run(observer, fn);

export const listCost = (choice: AiModelChoice, usage: ModelUsage) => {
  const known = catalogModel(choice.model);
  const input = choice.inputPer1M ?? known?.inputPer1M ?? 0;
  const output = choice.outputPer1M ?? known?.outputPer1M ?? 0;
  return (usage.inputTokens * input + (usage.outputTokens + usage.reasoningTokens) * output) / 1_000_000;
};

/** What a call is charged: nothing on a free-tier provider. */
export const usageCost = (choice: AiModelChoice, usage: ModelUsage, provider?: AiProviderConfig) =>
  provider?.freeTier ? 0 : listCost(choice, usage);

const toBreakdown = (
  choice: AiModelChoice,
  provider: AiProviderConfig,
  usage: ModelUsage,
): UsageBreakdown => ({
  model: choice.model,
  provider: provider.name,
  billingMode: "standard",
  promptTokenCount: usage.inputTokens,
  candidatesTokenCount: usage.outputTokens,
  thoughtsTokenCount: usage.reasoningTokens,
  totalTokenCount: usage.inputTokens + usage.outputTokens + usage.reasoningTokens,
  costUsd: usageCost(choice, usage, provider),
});

const statusOf = (error: unknown): AiCallStatus => {
  const failure = error as ModelCallError;
  if (failure?.blocked) return "blocked";
  if (failure?.quota?.scope === "day") return "quota_exhausted";
  if (failure?.status === 429 || failure?.quota) return "rate_limited";
  return "error";
};

const NO_USAGE: ModelUsage = { inputTokens: 0, outputTokens: 0, reasoningTokens: 0 };

const timeOfDay = (iso: number) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZoneName: "short" });

const callOnce = async (
  ai: AiSettings,
  choice: AiModelChoice,
  stage: AiStage,
  request: ModelRequest,
  usage: UsageBreakdown[],
) => {
  const provider = ai.providers.find((entry) => entry.id === choice.providerId);
  if (!provider) throw new ModelCallError(`Provider ${choice.providerId} is not configured`);
  const keys = providerKeys(provider);
  if (keys.length === 0) throw new ModelCallError(`${provider.name} has no API key`);
  const observe = tracking.getStore();
  const slot = (key: string) => `${key}:${choice.model}`;
  // OpenRouter-style accounts share one daily pool across their free models.
  const sharedPool = !!presetById(provider.preset)?.sharedDailyLimit;
  const parkedUntil = (key: string) =>
    Math.max(state.exhausted.get(slot(key)) || 0, sharedPool ? state.exhausted.get(`${key}:*`) || 0 : 0);

  const maxRounds = 4;
  let lastError: unknown = null;
  for (let round = 0; round < maxRounds; round += 1) {
    const now = Date.now();
    const usable = keys.filter((key) => parkedUntil(key) <= now);
    if (usable.length === 0) {
      const resetsAt = Math.min(...keys.map((key) => parkedUntil(key) || now));
      throw new ModelCallError(
        `${provider.name}: the daily quota of ${choice.model} is used up${keys.length > 1 ? " on every key" : ""}; it resets around ${timeOfDay(resetsAt)}.`,
        { status: 429, quota: { scope: "day", resetAt: new Date(resetsAt).toISOString() } },
      );
    }
    const ordered = [...usable].sort(
      (a, b) => (state.cooldowns.get(slot(a)) || 0) - (state.cooldowns.get(slot(b)) || 0),
    );
    const key = ordered[0];
    const readyAt = state.cooldowns.get(slot(key)) || 0;
    if (readyAt > now) await sleep(Math.min(60_000, readyAt - now));
    const started = Date.now();
    const report = (status: AiCallStatus, callUsage: ModelUsage, limits?: CallLimits, error?: string) =>
      observe?.({
        stage,
        providerId: provider.id,
        providerName: provider.name,
        preset: provider.preset,
        freeTier: provider.freeTier === true,
        model: choice.model,
        keyHint: keyHint(key),
        status,
        error,
        usage: callUsage,
        costUsd: usageCost(choice, callUsage, provider),
        listCostUsd: listCost(choice, callUsage),
        durationMs: Date.now() - started,
        limits,
      });
    try {
      const endpoint = {
        kind: provider.kind,
        apiKey: key,
        baseUrl: providerBaseUrl(provider),
        model: choice.model,
        preset: provider.preset,
      };
      const result =
        provider.kind === "gemini" ? await callGemini(endpoint, request) : await callOpenAiCompatible(endpoint, request);
      usage.push(toBreakdown(choice, provider, result.usage));
      report("ok", result.usage, result.limits?.length ? { windows: result.limits } : undefined);
      state.cooldowns.delete(slot(key));
      return result.json;
    } catch (error) {
      lastError = error;
      const failure = error as ModelCallError;
      if (failure.usage) usage.push(toBreakdown(choice, provider, failure.usage));
      report(
        statusOf(error),
        failure.usage || NO_USAGE,
        failure.quota || failure.limits?.length ? { quota: failure.quota, windows: failure.limits } : undefined,
        (error instanceof Error ? error.message : String(error)).slice(0, 500),
      );
      if (failure.quota?.scope === "day") {
        // Park this key for the model until the provider's reset and try the next one.
        const until = Date.parse(failure.quota.resetAt || "") || Date.now() + 3_600_000;
        const parkedSlot = sharedPool && /free-models-per-day/i.test(failure.message) ? `${key}:*` : slot(key);
        state.exhausted.set(parkedSlot, Math.max(until, Date.now() + 60_000));
        round -= 1; // switching keys is not a retry
        continue;
      }
      if (!isRetryable(error)) throw error;
      const wait = failure.retryAfterMs || 4_000 * 2 ** round;
      state.cooldowns.set(slot(key), Date.now() + Math.min(60_000, wait));
    }
  }
  throw lastError;
};

export const callModel = async ({
  ai,
  choice,
  fallback,
  stage,
  request,
  usage,
}: {
  ai: AiSettings;
  choice: AiModelChoice;
  fallback?: AiModelChoice;
  stage: AiStage;
  request: ModelRequest;
  usage: UsageBreakdown[];
}): Promise<{ json: unknown; model: string; fallbackUsed: boolean }> => {
  try {
    return { json: await callOnce(ai, choice, stage, request, usage), model: choice.model, fallbackUsed: false };
  } catch (error) {
    const sameModel = fallback?.model === choice.model && fallback?.providerId === choice.providerId;
    if (!fallback || sameModel || (error as ModelCallError).blocked) throw error;
    try {
      return { json: await callOnce(ai, fallback, stage, request, usage), model: fallback.model, fallbackUsed: true };
    } catch (fallbackError) {
      const first = error instanceof Error ? error.message : String(error);
      const second = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      throw new ModelCallError(`${first} Fallback ${fallback.model} also failed: ${second}`, {
        status: (fallbackError as ModelCallError).status,
        retryAfterMs: (fallbackError as ModelCallError).retryAfterMs,
        // Only give up for the day when both models are out of quota.
        quota:
          (error as ModelCallError).quota?.scope === "day" && (fallbackError as ModelCallError).quota?.scope === "day"
            ? (fallbackError as ModelCallError).quota
            : undefined,
        blocked: (fallbackError as ModelCallError).blocked,
      });
    }
  }
};
