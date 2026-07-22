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
  isEligibleAdultSafetyError,
  ParsedTranslation,
  TranslationAttemptError,
} from "@/server/gemini/translation";
import { isLocalOcrConfigured } from "@/server/local-ocr/auth";
import {
  buildLocalOcrRequestKey,
  enqueueLocalOcrJob,
  findLocalOcrJobByRequestKey,
  toLocalOcrSummary,
} from "@/server/local-ocr/jobs";
import { TranslationSettings, UsageBreakdown } from "@/types";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

const requestSchema = z.object({
  base64Image: z.string().default(""),
  mimeType: z
    .enum(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"])
    .default("image/jpeg"),
  targetLanguage: z.string().min(1),
  modelName: z.string().min(1),
  fallbackModelName: z.string().min(1).optional(),
  enableQualityFallback: z.boolean().optional(),
  customInstructions: z.string().optional(),
  seriesId: z.string().uuid().optional(),
  imageId: z.string().uuid().optional(),
  translationPipeline: z
    .enum(["auto", "gemini_vision", "local_ocr"])
    .default("auto"),
});

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const parsedRequest = requestSchema.safeParse(await request.json());
    if (!parsedRequest.success) {
      return NextResponse.json(
        { error: "Invalid request payload" },
        { status: 400 },
      );
    }

    const payload = parsedRequest.data;
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
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

    const primaryModel = payload.modelName;
    const fallbackModel =
      payload.fallbackModelName || settings.fallbackModel || "gemini-2.5-flash";
    const fallbackEnabled =
      payload.enableQualityFallback ?? settings.enableQualityFallback ?? true;
    const localRequestKey =
      payload.translationPipeline !== "gemini_vision" &&
      payload.seriesId &&
      payload.imageId &&
      isLocalOcrConfigured()
        ? buildLocalOcrRequestKey({
            userId,
            imageId: payload.imageId,
            targetLanguage: payload.targetLanguage,
            customInstructions: payload.customInstructions,
            primaryModel,
            fallbackModel,
            pipeline: payload.translationPipeline,
          })
        : null;

    if (localRequestKey) {
      const existingLocalJob = await findLocalOcrJobByRequestKey(
        localRequestKey,
        userId,
      );
      if (existingLocalJob?.status === "completed") {
        return NextResponse.json({
          bubbles: existingLocalJob.translatedBubbles || [],
          usage: existingLocalJob.usage,
        });
      }
      if (
        existingLocalJob &&
        ["queued", "leased", "translating"].includes(existingLocalJob.status)
      ) {
        return NextResponse.json(
          { localOcrJob: toLocalOcrSummary(existingLocalJob) },
          { status: 202 },
        );
      }
      if (existingLocalJob?.status === "failed") {
        const requeued = await enqueueLocalOcrJob({
          requestKey: localRequestKey,
          userId,
          seriesId: payload.seriesId!,
          imageId: payload.imageId!,
          targetLanguage: payload.targetLanguage,
          customInstructions: payload.customInstructions,
          primaryModel,
          fallbackModel,
          initialUsage:
            existingLocalJob.initialUsage ||
            combineUsage([], primaryModel, false),
          pipeline: payload.translationPipeline,
        });
        if (requeued) {
          return NextResponse.json(
            { localOcrJob: toLocalOcrSummary(requeued) },
            { status: 202 },
          );
        }
      }
    }

    if (payload.translationPipeline === "local_ocr") {
      if (!localRequestKey || !payload.seriesId || !payload.imageId) {
        return NextResponse.json(
          {
            error:
              "Local OCR is not configured or the image identifiers are missing.",
          },
          { status: 503 },
        );
      }
      const job = await enqueueLocalOcrJob({
        requestKey: localRequestKey,
        userId,
        seriesId: payload.seriesId,
        imageId: payload.imageId,
        targetLanguage: payload.targetLanguage,
        customInstructions: payload.customInstructions,
        primaryModel,
        fallbackModel,
        initialUsage: combineUsage([], primaryModel, false),
        requireVerifiedAdult: false,
        pipeline: "local_ocr",
      });
      if (!job) {
        return NextResponse.json(
          { error: "The selected image is not available for local OCR." },
          { status: 404 },
        );
      }
      return NextResponse.json(
        { localOcrJob: toLocalOcrSummary(job) },
        { status: 202 },
      );
    }

    if (!payload.base64Image) {
      return NextResponse.json(
        { error: "Image data is required for Gemini Vision." },
        { status: 400 },
      );
    }

    const prompt = buildTranslationPrompt(
      payload.targetLanguage,
      payload.customInstructions,
    );
    const pool = getGeminiApiKeyPool({
      poolId: userId,
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

    let result: ParsedTranslation;
    let modelUsed = primaryModel;
    let fallbackUsed = false;

    const queueEligibleSafetyFailure = async (error: unknown) => {
      if (
        !localRequestKey ||
        !payload.seriesId ||
        !payload.imageId ||
        payload.translationPipeline === "gemini_vision" ||
        !isEligibleAdultSafetyError(error)
      ) {
        return null;
      }
      const job = await enqueueLocalOcrJob({
        requestKey: localRequestKey,
        userId,
        seriesId: payload.seriesId,
        imageId: payload.imageId,
        targetLanguage: payload.targetLanguage,
        customInstructions: payload.customInstructions,
        primaryModel,
        fallbackModel,
        initialUsage: combineUsage(
          usageEntries,
          usageEntries.at(-1)?.model || primaryModel,
          fallbackUsed ||
            usageEntries.some((entry) => entry.model !== primaryModel),
        ),
        pipeline: "auto",
      });
      return job
        ? NextResponse.json(
            { localOcrJob: toLocalOcrSummary(job) },
            { status: 202 },
          )
        : null;
    };

    try {
      result = await runWithPool(primaryModel);
    } catch (primaryError) {
      if (!fallbackEnabled || fallbackModel === primaryModel) {
        const queued = await queueEligibleSafetyFailure(primaryError);
        if (queued) return queued;
        throw primaryError;
      }
      try {
        result = await runWithPool(fallbackModel);
        modelUsed = fallbackModel;
        fallbackUsed = true;
      } catch (fallbackError) {
        fallbackUsed = true;
        const safetyError = isEligibleAdultSafetyError(fallbackError)
          ? fallbackError
          : primaryError;
        const queued = await queueEligibleSafetyFailure(safetyError);
        if (queued) return queued;
        throw fallbackError;
      }
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

    const usage = combineUsage(usageEntries, modelUsed, fallbackUsed);
    usage.processing = {
      requestedPipeline: payload.translationPipeline,
      actualPipeline: "gemini_vision",
      detection: {
        provider: "gemini",
        model: modelUsed,
        regions: result.bubbles.length,
      },
      translation: {
        provider: "gemini",
        model: modelUsed,
        inputMode: "image",
        fallbackUsed,
      },
      completedAt: new Date().toISOString(),
    };

    return NextResponse.json({ bubbles: result.bubbles, usage });
  } catch (error) {
    console.error("Gemini route error:", error);
    const statusCode = parseGeminiStatusCode(error);
    const retryAfterMs =
      error && typeof error === "object" && "retryAfterMs" in error
        ? Number((error as { retryAfterMs?: number }).retryAfterMs)
        : undefined;

    return NextResponse.json(
      {
        error:
          (error as TranslationAttemptError)?.isSafetyBlocked === true
            ? "Gemini blocked this page for safety. Local OCR fallback requires a configured worker and a verified-adult series."
            : error instanceof Error
              ? error.message
              : "Unknown server error",
        reason:
          (error as TranslationAttemptError)?.blockReason ||
          (error as TranslationAttemptError)?.finishReason,
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
