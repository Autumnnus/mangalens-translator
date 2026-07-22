import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  isRetryableGeminiError,
  parseGeminiStatusCode,
  resolveActiveGeminiKeys,
} from "@/server/gemini/keys";
import { getGeminiApiKeyPool } from "@/server/gemini/keyPool";
import {
  buildTranslationPrompt,
  combineUsage,
  generateTranslation,
  ParsedTranslation,
  TranslationAttemptError,
} from "@/server/gemini/translation";
import { TranslationSettings, UsageBreakdown } from "@/types";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

const requestSchema = z.object({
  base64Image: z.string().min(1),
  mimeType: z
    .enum(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"])
    .default("image/jpeg"),
  targetLanguage: z.string().min(1),
  modelName: z.string().min(1),
  fallbackModelName: z.string().min(1).optional(),
  enableQualityFallback: z.boolean().optional(),
  customInstructions: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsedRequest = requestSchema.safeParse(await request.json());
    if (!parsedRequest.success) {
      return NextResponse.json(
        { error: "Invalid request payload" },
        { status: 400 },
      );
    }

    const payload = parsedRequest.data;
    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });
    const settings = (user?.settings || {}) as Partial<TranslationSettings>;
    const activeKeys = resolveActiveGeminiKeys(settings);

    if (activeKeys.length === 0) {
      return NextResponse.json(
        {
          error: settings.useCustomApiKey
            ? "API key pool is empty. Please add at least one key to the pool."
            : "No system Gemini API key found.",
        },
        { status: 400 },
      );
    }

    const prompt = buildTranslationPrompt(
      payload.targetLanguage,
      payload.customInstructions,
    );
    const pool = getGeminiApiKeyPool({
      poolId: session.user.id,
      keys: activeKeys,
    });
    const usageEntries: UsageBreakdown[] = [];

    const runWithPool = async (modelName: string) => {
      const triedKeys = new Set<string>();
      let lastError: unknown = null;

      while (triedKeys.size < activeKeys.length) {
        const lease = pool.acquire({ modelName, excludeKeys: triedKeys });
        if (!lease.key || !lease.release) {
          const summary = pool.getStatusSummary(modelName);
          const error = new Error(
            "All API keys are in cooldown or busy. Please retry shortly.",
          ) as Error & { status?: number; retryAfterMs?: number };
          error.status = 429;
          error.retryAfterMs = Math.max(
            lease.waitMs,
            summary.earliestReadyInMs || 500,
          );
          throw error;
        }

        triedKeys.add(lease.key);
        try {
          const result = await generateTranslation({
            apiKey: lease.key,
            modelName,
            base64Image: payload.base64Image,
            mimeType: payload.mimeType,
            prompt,
          });
          usageEntries.push(result.usage);
          pool.markSuccess(lease.key, result.usage.totalTokenCount);
          return result.parsed;
        } catch (error) {
          lastError = error;
          const failedUsage = (error as TranslationAttemptError).usage;
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

    const primaryModel = payload.modelName;
    const fallbackModel =
      payload.fallbackModelName || settings.fallbackModel || "gemini-2.5-flash";
    const fallbackEnabled =
      payload.enableQualityFallback ?? settings.enableQualityFallback ?? true;

    let result: ParsedTranslation;
    let modelUsed = primaryModel;
    let fallbackUsed = false;

    try {
      result = await runWithPool(primaryModel);
    } catch (primaryError) {
      if (!fallbackEnabled || fallbackModel === primaryModel) throw primaryError;
      result = await runWithPool(fallbackModel);
      modelUsed = fallbackModel;
      fallbackUsed = true;
    }

    if (
      fallbackEnabled &&
      fallbackModel !== primaryModel &&
      result.shouldFallback
    ) {
      try {
        result = await runWithPool(fallbackModel);
        modelUsed = fallbackModel;
        fallbackUsed = true;
      } catch (fallbackError) {
        console.warn(
          "Quality fallback failed; returning usable primary translation",
          fallbackError,
        );
      }
    }

    return NextResponse.json({
      bubbles: result.bubbles,
      usage: combineUsage(usageEntries, modelUsed, fallbackUsed),
    });
  } catch (error) {
    console.error("Gemini route error:", error);
    const statusCode = parseGeminiStatusCode(error);
    const retryAfterMs =
      error && typeof error === "object" && "retryAfterMs" in error
        ? Number((error as { retryAfterMs?: number }).retryAfterMs)
        : undefined;

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown server error",
        retryAfterMs,
      },
      {
        status:
          typeof statusCode === "number" && statusCode >= 400
            ? statusCode
            : 500,
      },
    );
  }
}
