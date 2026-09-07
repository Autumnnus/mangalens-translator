import {
  GenerateContentResponse,
  HarmBlockThreshold,
  HarmCategory,
  ThinkingLevel,
} from "@google/genai";
import { UsageBreakdown, UsageMetadata } from "@/types";

/** Shared Gemini plumbing for the detection and translation stages. */

export const SAFETY_SETTINGS = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
];

export const thinkingConfigFor = (modelName: string) =>
  modelName.startsWith("gemini-3")
    ? { thinkingLevel: ThinkingLevel.LOW }
    : { thinkingBudget: 0 };

export type GeminiCallError = Error & {
  usage?: UsageBreakdown;
  blockReason?: string;
  finishReason?: string;
  safetyCategories?: string[];
  isSafetyBlocked?: boolean;
  status?: number;
  retryAfterMs?: number;
};

/** Wraps a parse/empty-response failure with everything the caller needs to bill and route it. */
export const toGeminiCallError = (
  error: unknown,
  response: GenerateContentResponse | null,
  usage: UsageBreakdown,
  fallbackMessage: string,
): GeminiCallError => {
  const candidate = response?.candidates?.[0];
  const blockReason = response?.promptFeedback?.blockReason;
  const finishReason = candidate?.finishReason;
  const safetyRatings = [
    ...(response?.promptFeedback?.safetyRatings || []),
    ...(candidate?.safetyRatings || []),
  ];
  const wrapped = new Error(
    error instanceof Error ? error.message : fallbackMessage,
  ) as GeminiCallError;
  wrapped.usage = usage;
  wrapped.blockReason = blockReason;
  wrapped.finishReason = finishReason;
  wrapped.safetyCategories = [
    ...new Set(
      safetyRatings
        .filter((rating) => rating.blocked === true)
        .map((rating) => String(rating.category || ""))
        .filter(Boolean),
    ),
  ];
  wrapped.isSafetyBlocked =
    blockReason === "SAFETY" || finishReason === "SAFETY";
  return wrapped;
};

export const isEligibleAdultSafetyError = (error: unknown) => {
  const attempt = error as GeminiCallError;
  return (
    attempt?.isSafetyBlocked === true &&
    (attempt.safetyCategories || []).includes(
      HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    )
  );
};

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** Accepts 0-1 or 0-100 and returns 0-1. */
export const normalizeConfidence = (value: unknown) => {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0.5;
  return clamp(numeric > 1 ? numeric / 100 : numeric, 0, 1);
};

export const usageFromResponse = (
  response: GenerateContentResponse,
  model: string,
  billingMode: UsageBreakdown["billingMode"],
): UsageBreakdown => ({
  model,
  billingMode,
  promptTokenCount: response.usageMetadata?.promptTokenCount || 0,
  candidatesTokenCount: response.usageMetadata?.candidatesTokenCount || 0,
  thoughtsTokenCount: response.usageMetadata?.thoughtsTokenCount || 0,
  totalTokenCount: response.usageMetadata?.totalTokenCount || 0,
});

export const combineUsage = (
  entries: UsageBreakdown[],
  modelUsed: string,
  fallbackUsed: boolean,
): UsageMetadata => ({
  promptTokenCount: entries.reduce((t, e) => t + e.promptTokenCount, 0),
  candidatesTokenCount: entries.reduce((t, e) => t + e.candidatesTokenCount, 0),
  thoughtsTokenCount: entries.reduce((t, e) => t + e.thoughtsTokenCount, 0),
  totalTokenCount: entries.reduce((t, e) => t + e.totalTokenCount, 0),
  breakdown: entries,
  modelUsed,
  fallbackUsed,
});
