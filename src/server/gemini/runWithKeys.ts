import { UsageBreakdown } from "@/types";
import { GeminiCallError } from "./common";
import { getGeminiApiKeyPool } from "./keyPool";
import { isRetryableGeminiError } from "./keys";

/**
 * Runs one Gemini call through the user's key pool: rate-limited keys are
 * rotated, every attempt's usage is recorded (failed calls are billed too),
 * and non-retryable errors are surfaced immediately.
 */
export const runWithKeyPool = async <T>({
  userId,
  keys,
  modelName,
  usageEntries,
  run,
}: {
  userId: string;
  keys: string[];
  modelName: string;
  /** Every attempt's usage is appended here, successful or not. */
  usageEntries: UsageBreakdown[];
  run: (apiKey: string) => Promise<{ value: T; usage: UsageBreakdown }>;
}): Promise<T> => {
  if (keys.length === 0) throw new Error("No Gemini API key available");
  const pool = getGeminiApiKeyPool({ poolId: userId, keys });
  const triedKeys = new Set<string>();
  let lastError: unknown = null;

  while (triedKeys.size < keys.length) {
    const lease = pool.acquire({ modelName, excludeKeys: triedKeys });
    if (!lease.key || !lease.release) {
      const summary = pool.getStatusSummary(modelName);
      const error = new Error(
        "All API keys are in cooldown or busy. Please retry shortly.",
      ) as GeminiCallError;
      error.status = 429;
      error.retryAfterMs = Math.max(
        lease.waitMs,
        summary.earliestReadyInMs || 500,
      );
      throw error;
    }
    triedKeys.add(lease.key);
    try {
      const result = await run(lease.key);
      usageEntries.push(result.usage);
      pool.markSuccess(lease.key, result.usage.totalTokenCount);
      return result.value;
    } catch (error) {
      lastError = error;
      const failedUsage = (error as GeminiCallError).usage;
      if (failedUsage) {
        usageEntries.push(failedUsage);
        pool.markSuccess(lease.key, failedUsage.totalTokenCount);
      }
      if (isRetryableGeminiError(error)) {
        pool.markRateLimited(lease.key, modelName);
        continue;
      }
      throw error;
    } finally {
      lease.release();
    }
  }
  throw lastError || new Error("All Gemini API keys failed");
};
