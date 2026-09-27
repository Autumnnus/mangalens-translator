import { catalogModel } from "@/lib/aiCatalog";
import { AiModelChoice, AiSettings, UsageBreakdown } from "@/types";
import { callGemini } from "./gemini";
import { callOpenAiCompatible } from "./openai";
import { providerBaseUrl, providerKeys } from "./settings";
import { isRetryable, ModelCallError, ModelRequest, ModelUsage } from "./types";

/**
 * Runs one model call for a pipeline stage: picks the provider, rotates its
 * keys past rate limits, retries transient failures with backoff and falls
 * back to a second model when one is configured. Every attempt's usage is
 * recorded, including failed ones, because providers bill them.
 */

const cooldowns = new Map<string, number>(); // `${key}:${model}` -> ready at (ms)
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const usageCost = (choice: AiModelChoice, usage: ModelUsage) => {
  const known = catalogModel(choice.model);
  const input = choice.inputPer1M ?? known?.inputPer1M ?? 0;
  const output = choice.outputPer1M ?? known?.outputPer1M ?? 0;
  return (usage.inputTokens * input + (usage.outputTokens + usage.reasoningTokens) * output) / 1_000_000;
};

const toBreakdown = (choice: AiModelChoice, provider: string, usage: ModelUsage): UsageBreakdown => ({
  model: choice.model,
  provider,
  billingMode: "standard",
  promptTokenCount: usage.inputTokens,
  candidatesTokenCount: usage.outputTokens,
  thoughtsTokenCount: usage.reasoningTokens,
  totalTokenCount: usage.inputTokens + usage.outputTokens + usage.reasoningTokens,
  costUsd: usageCost(choice, usage),
});

const callOnce = async (ai: AiSettings, choice: AiModelChoice, request: ModelRequest, usage: UsageBreakdown[]) => {
  const provider = ai.providers.find((entry) => entry.id === choice.providerId);
  if (!provider) throw new ModelCallError(`Provider ${choice.providerId} is not configured`);
  const keys = providerKeys(provider);
  if (keys.length === 0) throw new ModelCallError(`${provider.name} has no API key`);

  const maxRounds = 4;
  let lastError: unknown = null;
  for (let round = 0; round < maxRounds; round += 1) {
    const now = Date.now();
    const ordered = [...keys].sort(
      (a, b) => (cooldowns.get(`${a}:${choice.model}`) || 0) - (cooldowns.get(`${b}:${choice.model}`) || 0),
    );
    const key = ordered[0];
    const readyAt = cooldowns.get(`${key}:${choice.model}`) || 0;
    if (readyAt > now) await sleep(Math.min(60_000, readyAt - now));
    try {
      const endpoint = { kind: provider.kind, apiKey: key, baseUrl: providerBaseUrl(provider), model: choice.model };
      const result =
        provider.kind === "gemini" ? await callGemini(endpoint, request) : await callOpenAiCompatible(endpoint, request);
      usage.push(toBreakdown(choice, provider.name, result.usage));
      cooldowns.delete(`${key}:${choice.model}`);
      return result.json;
    } catch (error) {
      lastError = error;
      const failed = (error as ModelCallError).usage;
      if (failed) usage.push(toBreakdown(choice, provider.name, failed));
      if (!isRetryable(error)) throw error;
      const wait = (error as ModelCallError).retryAfterMs || 4_000 * 2 ** round;
      cooldowns.set(`${key}:${choice.model}`, Date.now() + Math.min(60_000, wait));
    }
  }
  throw lastError;
};

export const callModel = async ({
  ai,
  choice,
  fallback,
  request,
  usage,
}: {
  ai: AiSettings;
  choice: AiModelChoice;
  fallback?: AiModelChoice;
  request: ModelRequest;
  usage: UsageBreakdown[];
}): Promise<{ json: unknown; model: string; fallbackUsed: boolean }> => {
  try {
    return { json: await callOnce(ai, choice, request, usage), model: choice.model, fallbackUsed: false };
  } catch (error) {
    if (!fallback || fallback.model === choice.model || (error as ModelCallError).blocked) throw error;
    return { json: await callOnce(ai, fallback, request, usage), model: fallback.model, fallbackUsed: true };
  }
};
