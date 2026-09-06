import { db } from "@/db";
import { images, series, translationJobs, users } from "@/db/schema";
import { getObjectData } from "@/lib/storage";
import { combineUsage, GeminiCallError, usageFromResponse } from "@/server/gemini/common";
import {
  buildDetectionConfig,
  buildDetectionPrompt,
  detectRegions,
  ParsedDetection,
  parseDetectionResponse,
} from "@/server/gemini/detect";
import { resolveActiveGeminiKeys } from "@/server/gemini/keys";
import { runWithKeyPool } from "@/server/gemini/runWithKeys";
import { getOwnedImage, readDimensions } from "@/server/pages/layoutService";
import { prepareModelImage } from "@/server/pipeline/prepareImage";
import {
  completeDetectedPage,
  PipelineCancelledError,
  resolvePipelineSettings,
} from "@/server/pipeline/translatePage";
import {
  BatchTranslationItemResult,
  BatchTranslationJobSummary,
  PageJobSummary,
  TranslationSettings,
  UsageBreakdown,
} from "@/types";
import { GoogleGenAI, InlinedRequest, JobState } from "@google/genai";
import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { createHash } from "node:crypto";
import {
  completePageJob,
  createPageJob,
  failPageJob,
  isPageJobActive,
  PageJobRow,
  setPageJobStage,
  toPageJobSummary,
} from "./pageJobs";

/**
 * Gemini Batch provider: the detection stage runs as an asynchronous provider
 * job at the batch rate; completion (translate, render, store) runs here when
 * the provider reports success. Each page has a page job that tracks it.
 */

const MAX_INLINE_BYTES = 17 * 1024 * 1024;
const MAX_BATCH_ITEMS = 10;
const FINALIZATION_LEASE_MS = 6 * 60 * 1000;
const POLL_MIN_INTERVAL_MS = 45 * 1000;

export type TranslationJobRow = typeof translationJobs.$inferSelect;

const fingerprintKey = (key: string) =>
  createHash("sha256").update(key).digest("hex").slice(0, 24);

const getUserSettingsAndKeys = async (userId: string) => {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  const settings = (user?.settings || {}) as Partial<TranslationSettings>;
  return { settings, keys: resolveActiveGeminiKeys(settings) };
};

export const toBatchSummary = (job: TranslationJobRow): BatchTranslationJobSummary => ({
  id: job.id,
  imageIds: job.imageIds,
  status: job.status === "finalizing" ? "running" : (job.status as BatchTranslationJobSummary["status"]),
  results: job.results || undefined,
  error: job.error || undefined,
});

// ---------------------------------------------------------------------------
// Creation

export const createBatchJobs = async ({
  userId,
  seriesId,
  imageIds,
}: {
  userId: string;
  seriesId: string;
  imageIds: string[];
}): Promise<{ jobs: BatchTranslationJobSummary[]; pageJobs: PageJobSummary[]; rejectedImageIds: string[] }> => {
  const requestedIds = [...new Set(imageIds)];
  const imageRows = await db.query.images.findMany({
    where: and(eq(images.seriesId, seriesId), inArray(images.id, requestedIds)),
    columns: { layout: false, bubbles: false },
  });
  const byId = new Map(imageRows.map((image) => [image.id, image]));
  const orderedImages = requestedIds
    .map((id) => byId.get(id))
    .filter((image): image is (typeof imageRows)[number] => !!image);

  const { settings, keys } = await getUserSettingsAndKeys(userId);
  if (keys.length === 0) throw new Error("No Gemini API key available");

  const model = settings.model || "gemini-2.5-flash-lite";
  const fallbackModel = settings.fallbackModel || "gemini-2.5-flash";
  const qualityFallback = settings.enableQualityFallback !== false;
  const prompt = buildDetectionPrompt();
  const itemLimit = Math.min(MAX_BATCH_ITEMS, Math.max(1, settings.batchSize || MAX_BATCH_ITEMS));

  const chunks: { imageIds: string[]; requests: InlinedRequest[]; bytes: number }[] = [];
  let current = { imageIds: [] as string[], requests: [] as InlinedRequest[], bytes: 0 };
  for (const image of orderedImages) {
    const object = await getObjectData(image.originalKey);
    if (!object.bytes || object.bytes.length === 0) continue;
    const modelImage = await prepareModelImage(Buffer.from(object.bytes));
    const estimatedBytes = modelImage.base64.length + prompt.length + 2048;
    if (
      current.requests.length > 0 &&
      (current.bytes + estimatedBytes > MAX_INLINE_BYTES || current.requests.length >= itemLimit)
    ) {
      chunks.push(current);
      current = { imageIds: [], requests: [], bytes: 0 };
    }
    if (estimatedBytes > MAX_INLINE_BYTES) continue;
    current.imageIds.push(image.id);
    current.bytes += estimatedBytes;
    current.requests.push({
      metadata: { imageId: image.id },
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            { inlineData: { mimeType: modelImage.mimeType, data: modelImage.base64 } },
          ],
        },
      ],
      config: buildDetectionConfig(model),
    });
  }
  if (current.requests.length > 0) chunks.push(current);

  const createdJobs: BatchTranslationJobSummary[] = [];
  const createdPageJobs: PageJobSummary[] = [];
  const submitted = new Set<string>();
  let lastError: unknown = null;

  for (const [chunkIndex, chunk] of chunks.entries()) {
    let providerJobName: string | undefined;
    let selectedKey: string | undefined;
    for (const key of keys) {
      try {
        const client = new GoogleGenAI({ apiKey: key });
        const providerJob = await client.batches.create({
          model,
          src: chunk.requests,
          config: { displayName: `mangalens-${seriesId.slice(0, 8)}-${chunkIndex + 1}` },
        });
        providerJobName = providerJob.name;
        selectedKey = key;
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!providerJobName || !selectedKey) continue;

    const [job] = await db
      .insert(translationJobs)
      .values({
        userId,
        seriesId,
        providerJobName,
        keyFingerprint: fingerprintKey(selectedKey),
        model,
        fallbackModel,
        prompt,
        qualityFallback: qualityFallback ? 1 : 0,
        pipeline: settings.translationPipeline || "auto",
        imageIds: chunk.imageIds,
        status: "queued",
      })
      .returning();
    for (const imageId of chunk.imageIds) {
      const pageJob = await createPageJob({
        userId,
        seriesId,
        imageId,
        provider: "gemini_batch",
        requestedPipeline: settings.translationPipeline === "gemini_vision" ? "gemini_vision" : "auto",
        providerRef: job.id,
        stage: "detecting",
      });
      createdPageJobs.push(toPageJobSummary(pageJob));
      submitted.add(imageId);
    }
    createdJobs.push(toBatchSummary(job));
  }

  if (createdJobs.length === 0) {
    throw lastError instanceof Error ? lastError : new Error("Gemini Batch job could not be created");
  }
  return {
    jobs: createdJobs,
    pageJobs: createdPageJobs,
    rejectedImageIds: requestedIds.filter((id) => !submitted.has(id)),
  };
};

// ---------------------------------------------------------------------------
// Polling and finalization

const pageJobFor = async (storedJob: TranslationJobRow, imageId: string): Promise<PageJobRow | null> =>
  (await db.query.pageJobs.findFirst({
    where: (table, { and: andOp, eq: eqOp }) =>
      andOp(eqOp(table.imageId, imageId), eqOp(table.providerRef, storedJob.id)),
    orderBy: (table, { desc }) => desc(table.createdAt),
  })) || null;

/**
 * Checks the provider state for one batch job and, on success, completes
 * every page. Only one caller finalizes at a time (short lease).
 */
export const checkBatchJob = async (storedJob: TranslationJobRow): Promise<TranslationJobRow> => {
  if (storedJob.status === "completed" || storedJob.status === "failed") return storedJob;
  const staleFinalizationBefore = new Date(Date.now() - FINALIZATION_LEASE_MS);
  if (storedJob.status === "finalizing" && storedJob.updatedAt && storedJob.updatedAt > staleFinalizationBefore) {
    return storedJob;
  }

  const { settings, keys } = await getUserSettingsAndKeys(storedJob.userId);
  const matchingKey = keys.find((key) => fingerprintKey(key) === storedJob.keyFingerprint);
  if (!matchingKey) {
    return failWholeBatch(storedJob, "The API key used for this Batch job is no longer available");
  }

  const client = new GoogleGenAI({ apiKey: matchingKey });
  const providerJob = await client.batches.get({ name: storedJob.providerJobName });

  if (
    providerJob.state === JobState.JOB_STATE_FAILED ||
    providerJob.state === JobState.JOB_STATE_CANCELLED ||
    providerJob.state === JobState.JOB_STATE_EXPIRED
  ) {
    return failWholeBatch(storedJob, providerJob.error?.message || "Gemini Batch job failed");
  }
  if (providerJob.state !== JobState.JOB_STATE_SUCCEEDED) {
    const [running] = await db
      .update(translationJobs)
      .set({ status: "running", updatedAt: new Date() })
      .where(eq(translationJobs.id, storedJob.id))
      .returning();
    return running;
  }

  const claimCondition =
    storedJob.status === "finalizing"
      ? and(
          eq(translationJobs.id, storedJob.id),
          eq(translationJobs.status, "finalizing"),
          or(isNull(translationJobs.updatedAt), lt(translationJobs.updatedAt, staleFinalizationBefore)),
        )
      : and(eq(translationJobs.id, storedJob.id), inArray(translationJobs.status, ["queued", "running"]));
  const [claimedJob] = await db
    .update(translationJobs)
    .set({ status: "finalizing", updatedAt: new Date() })
    .where(claimCondition)
    .returning();
  if (!claimedJob) {
    return (await db.query.translationJobs.findFirst({ where: eq(translationJobs.id, storedJob.id) })) || storedJob;
  }

  const inlineResponses = providerJob.dest?.inlinedResponses || [];
  const seriesRow = await db.query.series.findFirst({
    where: eq(series.id, storedJob.seriesId),
    columns: { name: true, originalTitle: true, author: true },
  });
  const context = {
    seriesTitle: seriesRow?.name,
    originalTitle: seriesRow?.originalTitle,
    author: seriesRow?.author,
  };
  const pipelineSettings = resolvePipelineSettings(settings, {
    model: storedJob.model,
    fallbackModel: storedJob.fallbackModel,
    enableQualityFallback: storedJob.qualityFallback === 1,
  });
  const results: BatchTranslationItemResult[] = [];

  for (let index = 0; index < storedJob.imageIds.length; index += 1) {
    const imageId = storedJob.imageIds[index];
    const inline = inlineResponses[index];
    const usageEntries: UsageBreakdown[] = [];
    const pageJob = await pageJobFor(storedJob, imageId);
    let detection: ParsedDetection | null = null;
    let detectionModel = storedJob.model;
    let fallbackUsed = false;
    let failure: string | undefined;

    if (pageJob && !["detecting", "queued"].includes(pageJob.stage)) {
      results.push({ imageId, usage: combineUsage([], storedJob.model, false), error: "İş iptal edildi" });
      continue;
    }

    try {
      const image = await getOwnedImage(imageId, storedJob.userId);
      if (!image) throw new Error("Image no longer exists");
      const object = await getObjectData(image.originalKey);
      if (!object.bytes?.length) throw new Error("Original image is missing");
      const original = Buffer.from(object.bytes);
      const { width, height } = await readDimensions(original);

      try {
        if (!inline?.response) throw new Error(inline?.error?.message || "Empty Batch response");
        usageEntries.push(usageFromResponse(inline.response, storedJob.model, "batch"));
        if (!inline.response.text) throw new Error(inline?.error?.message || "Empty Batch response");
        detection = parseDetectionResponse(inline.response.text, width, height);
      } catch (error) {
        failure = error instanceof Error ? error.message : String(error);
      }

      const needsFallback =
        !detection ||
        (pipelineSettings.enableQualityFallback &&
          detection.shouldFallback &&
          storedJob.fallbackModel !== storedJob.model);
      if (needsFallback) {
        try {
          const modelImage = await prepareModelImage(original);
          const better = await runWithKeyPool({
            userId: storedJob.userId,
            keys,
            modelName: storedJob.fallbackModel,
            usageEntries,
            run: async (apiKey) => {
              const result = await detectRegions({
                apiKey,
                modelName: storedJob.fallbackModel,
                base64Image: modelImage.base64,
                mimeType: modelImage.mimeType,
                width,
                height,
              });
              return { value: result.parsed, usage: result.usage };
            },
          });
          if (!detection || better.regions.length > 0) {
            detection = better;
            detectionModel = storedJob.fallbackModel;
            fallbackUsed = true;
            failure = undefined;
          }
        } catch (error) {
          if (!detection) failure = error instanceof Error ? error.message : String(error);
        }
      }
      if (!detection) throw new Error(failure || "Detection failed");

      const completed = await completeDetectedPage({
        image,
        userId: storedJob.userId,
        keys,
        settings: pipelineSettings,
        requestedPipeline: storedJob.pipeline === "gemini_vision" ? "gemini_vision" : "auto",
        detected: detection.regions,
        detector: { provider: "gemini", model: detectionModel, usageEntries, fallbackUsed },
        context,
        original,
        sourceLanguage: detection.sourceLanguage,
        hooks: pageJob
          ? {
              onStage: (stage) => setPageJobStage(pageJob.id, stage),
              shouldContinue: () => isPageJobActive(pageJob.id),
            }
          : undefined,
      });
      if (pageJob) await completePageJob(pageJob.id, { usage: completed.usage, cost: completed.cost });
      results.push({ imageId, usage: completed.usage, cost: completed.cost, applied: true, translatedKey: completed.render.key });
    } catch (error) {
      if (error instanceof PipelineCancelledError) {
        results.push({ imageId, usage: combineUsage(usageEntries, detectionModel, fallbackUsed), error: "İş iptal edildi" });
        continue;
      }
      const message = error instanceof Error ? error.message : String(error);
      console.error("Batch item completion failed", imageId, error);
      const failedUsage = (error as GeminiCallError).usage;
      if (failedUsage) usageEntries.push(failedUsage);
      if (pageJob) await failPageJob(pageJob.id, message);
      else {
        await db.update(images).set({ status: "error", updatedAt: new Date() }).where(eq(images.id, imageId)).catch(() => undefined);
      }
      results.push({ imageId, usage: combineUsage(usageEntries, detectionModel, fallbackUsed), error: message });
    }
  }

  const [completed] = await db
    .update(translationJobs)
    .set({ status: "completed", results, updatedAt: new Date() })
    .where(eq(translationJobs.id, storedJob.id))
    .returning();
  return completed;
};

const failWholeBatch = async (storedJob: TranslationJobRow, message: string) => {
  const [failed] = await db
    .update(translationJobs)
    .set({ status: "failed", error: message, updatedAt: new Date() })
    .where(eq(translationJobs.id, storedJob.id))
    .returning();
  for (const imageId of storedJob.imageIds) {
    const pageJob = await pageJobFor(storedJob, imageId);
    if (pageJob) await failPageJob(pageJob.id, message);
  }
  await db
    .update(images)
    .set({ status: "error", updatedAt: new Date() })
    .where(and(inArray(images.id, storedJob.imageIds), eq(images.status, "processing")));
  return failed;
};

const lastPolled = new Map<string, number>();

/** Scheduler tick: polls every unfinished batch job, throttled per job. */
export const pollBatchJobs = async () => {
  const pending = await db.query.translationJobs.findMany({
    where: inArray(translationJobs.status, ["queued", "running", "finalizing"]),
    limit: 50,
  });
  for (const job of pending) {
    const last = lastPolled.get(job.id) || 0;
    if (Date.now() - last < POLL_MIN_INTERVAL_MS) continue;
    lastPolled.set(job.id, Date.now());
    try {
      const updated = await checkBatchJob(job);
      if (updated.status === "completed" || updated.status === "failed") lastPolled.delete(job.id);
    } catch (error) {
      console.error("Batch poll failed", job.id, error);
    }
  }
};
