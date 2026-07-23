import { db } from "@/db";
import { images, localOcrJobs, series, users } from "@/db/schema";
import { resolveActiveGeminiKeys } from "@/server/gemini/keys";
import {
  combineUsage,
  generateTextOnlyTranslation,
  TranslationAttemptError,
} from "@/server/gemini/translation";
import {
  LocalOcrBubble,
  LocalOcrJobSummary,
  LocalOcrRunMetadata,
  TranslationSettings,
  UsageBreakdown,
  UsageMetadata,
} from "@/types";
import { and, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { isLocalOcrConfigured } from "./auth";

export const buildLocalOcrRequestKey = ({
  userId,
  imageId,
  targetLanguage,
  customInstructions,
  primaryModel,
  fallbackModel,
  pipeline = "auto",
}: {
  userId: string;
  imageId: string;
  targetLanguage: string;
  customInstructions?: string;
  primaryModel: string;
  fallbackModel: string;
  pipeline?: "auto" | "gemini_vision" | "local_ocr";
}) =>
  createHash("sha256")
    .update(
      JSON.stringify({
        userId,
        imageId,
        targetLanguage,
        customInstructions: customInstructions?.trim() || "",
        primaryModel,
        fallbackModel,
        pipeline,
      }),
    )
    .digest("hex");

export const toLocalOcrSummary = (
  job: typeof localOcrJobs.$inferSelect,
): LocalOcrJobSummary => ({
  id: job.id,
  status: job.status as LocalOcrJobSummary["status"],
  bubbles: job.translatedBubbles || undefined,
  usage: job.usage || undefined,
  error: job.error || undefined,
});

export const findLocalOcrJobByRequestKey = async (
  requestKey: string,
  userId: string,
) =>
  db.query.localOcrJobs.findFirst({
    where: and(
      eq(localOcrJobs.requestKey, requestKey),
      eq(localOcrJobs.userId, userId),
    ),
  });

export const enqueueLocalOcrJob = async ({
  requestKey,
  userId,
  seriesId,
  imageId,
  targetLanguage,
  customInstructions,
  primaryModel,
  fallbackModel,
  initialUsage,
  requireVerifiedAdult = true,
  pipeline = "auto",
}: {
  requestKey: string;
  userId: string;
  seriesId: string;
  imageId: string;
  targetLanguage: string;
  customInstructions?: string;
  primaryModel: string;
  fallbackModel: string;
  initialUsage: UsageMetadata;
  requireVerifiedAdult?: boolean;
  pipeline?: "auto" | "gemini_vision" | "local_ocr";
}) => {
  if (!isLocalOcrConfigured()) return null;

  const [ownedImage] = await db
    .select({ imageId: images.id, contentMode: series.contentMode })
    .from(images)
    .innerJoin(series, eq(images.seriesId, series.id))
    .where(
      and(
        eq(images.id, imageId),
        eq(images.seriesId, seriesId),
        eq(series.userId, userId),
      ),
    )
    .limit(1);
  if (
    !ownedImage ||
    (requireVerifiedAdult && ownedImage.contentMode !== "adult_verified")
  ) {
    return null;
  }

  const existing = await findLocalOcrJobByRequestKey(requestKey, userId);
  if (existing) {
    if (existing.status === "failed") {
      const [requeued] = await db
        .update(localOcrJobs)
        .set({
          status: "queued",
          error: null,
          leaseOwner: null,
          leaseExpiresAt: null,
          attempts: 0,
          ocrBubbles: null,
          ocrMetadata: null,
          initialUsage,
          pipeline,
          updatedAt: new Date(),
        })
        .where(eq(localOcrJobs.id, existing.id))
        .returning();
      return requeued;
    }
    return existing;
  }

  const [created] = await db
    .insert(localOcrJobs)
    .values({
      requestKey,
      userId,
      seriesId,
      imageId,
      targetLanguage,
      customInstructions,
      primaryModel,
      fallbackModel,
      initialUsage,
      pipeline,
      status: "queued",
    })
    .onConflictDoNothing({ target: localOcrJobs.requestKey })
    .returning();
  return (
    created || (await findLocalOcrJobByRequestKey(requestKey, userId)) || null
  );
};

export const translateLocalOcrResult = async (
  job: typeof localOcrJobs.$inferSelect,
  bubbles: LocalOcrBubble[],
  ocrMetadata: LocalOcrRunMetadata,
) => {
  const user = await db.query.users.findFirst({
    where: eq(users.id, job.userId),
  });
  const settings = (user?.settings || {}) as Partial<TranslationSettings>;
  const keys = resolveActiveGeminiKeys(settings);
  if (keys.length === 0) throw new Error("No Gemini API key available");

  const usageEntries: UsageBreakdown[] = [
    ...(job.initialUsage?.breakdown || []),
  ];
  let lastError: unknown = null;
  const models = [...new Set([job.primaryModel, job.fallbackModel])];

  for (const modelName of models) {
    for (const key of keys) {
      try {
        const translated = await generateTextOnlyTranslation({
          apiKey: key,
          modelName,
          targetLanguage: job.targetLanguage,
          customInstructions: job.customInstructions,
          bubbles,
        });
        usageEntries.push(translated.usage);
        const usage = combineUsage(
          usageEntries,
          modelName,
          modelName !== job.primaryModel,
        );
        usage.processing = {
          requestedPipeline:
            job.pipeline === "local_ocr" ? "local_ocr" : "auto",
          actualPipeline: "local_ocr",
          detection: {
            provider: "paddleocr",
            model: ocrMetadata.engine,
            workerId: job.leaseOwner || undefined,
            device: ocrMetadata.device,
            durationMs: ocrMetadata.durationMs,
            regions: ocrMetadata.regions,
            mangaOcrEnabled: ocrMetadata.mangaOcrEnabled,
          },
          translation: {
            provider: "gemini",
            model: modelName,
            inputMode: "text",
            fallbackUsed: modelName !== job.primaryModel,
          },
          completedAt: new Date().toISOString(),
        };
        return {
          bubbles: translated.bubbles,
          usage,
        };
      } catch (error) {
        lastError = error;
        const failedUsage = (error as TranslationAttemptError).usage;
        if (failedUsage) usageEntries.push(failedUsage);
        // A second API key does not change a content/format rejection. Key
        // rotation is only useful for quota and availability errors.
        const message = error instanceof Error ? error.message : String(error);
        if (!/429|503|quota|rate limit|unavailable/i.test(message)) break;
      }
    }
  }

  throw lastError || new Error("Text-only translation failed");
};
