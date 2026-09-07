import { db } from "@/db";
import { images, localOcrJobs, pageJobs, series, users } from "@/db/schema";
import { combineUsage, GeminiCallError, isEligibleAdultSafetyError } from "@/server/gemini/common";
import { isRetryableGeminiError, resolveActiveGeminiKeys } from "@/server/gemini/keys";
import { buildLocalOcrRequestKey, enqueueLocalOcrJob } from "@/server/local-ocr/jobs";
import { getOwnedImage } from "@/server/pages/layoutService";
import {
  PipelineCancelledError,
  PipelineHooks,
  resolvePipelineSettings,
  translatePageWithGemini,
} from "@/server/pipeline/translatePage";
import {
  PageJobOptions,
  PageJobProvider,
  PageJobStage,
  PageJobSummary,
  TranslationSettings,
  UsageMetadata,
} from "@/types";
import { and, asc, desc, eq, gt, inArray, lt, notInArray, or } from "drizzle-orm";

/**
 * The single job model behind every translation path. A page job is created
 * by the UI (interactive), by a Gemini Batch submission or by a local OCR
 * enqueue; providers advance its stage and the UI only polls this table.
 *
 * Gemini interactive jobs are executed by an in-process runner with a small
 * concurrency limit, so "Translate All" keeps going after the tab is closed.
 */

export type PageJobRow = typeof pageJobs.$inferSelect;

export const ACTIVE_STAGES: PageJobStage[] = ["queued", "detecting", "translating", "rendering"];
export const isActiveStage = (stage: string) => (ACTIVE_STAGES as string[]).includes(stage);

const GEMINI_CONCURRENCY = 2;
const MAX_ATTEMPTS = 6;
const STALE_MS = 10 * 60 * 1000;
const RECENT_MS = 10 * 60 * 1000;

const globalState = globalThis as unknown as {
  __pageJobRunner?: { running: Set<string>; pumping: boolean; timer: NodeJS.Timeout | null };
};
const runner =
  globalState.__pageJobRunner ||
  (globalState.__pageJobRunner = { running: new Set<string>(), pumping: false, timer: null });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const toPageJobSummary = (job: PageJobRow): PageJobSummary => ({
  id: job.id,
  imageId: job.imageId,
  seriesId: job.seriesId,
  provider: job.provider as PageJobProvider,
  stage: job.stage as PageJobStage,
  attempts: job.attempts,
  error: job.error || undefined,
  cost: job.cost ?? undefined,
  waitingForWorker: job.provider === "local_ocr" && job.stage === "detecting",
  createdAt: job.createdAt.toISOString(),
  updatedAt: job.updatedAt.toISOString(),
  completedAt: job.completedAt?.toISOString(),
});

// ---------------------------------------------------------------------------
// Lifecycle

export const createPageJob = async ({
  userId,
  seriesId,
  imageId,
  provider,
  requestedPipeline,
  providerRef,
  options,
  stage = "queued",
}: {
  userId: string;
  seriesId: string;
  imageId: string;
  provider: PageJobProvider;
  requestedPipeline: "auto" | "gemini_vision" | "local_ocr";
  providerRef?: string;
  options?: PageJobOptions;
  stage?: PageJobStage;
}): Promise<PageJobRow> => {
  const now = new Date();
  return db.transaction(async (tx) => {
    // One active job per page: a new request supersedes the old one.
    await tx
      .update(pageJobs)
      .set({ stage: "cancelled", error: "Replaced by a newer job", updatedAt: now, completedAt: now })
      .where(and(eq(pageJobs.imageId, imageId), inArray(pageJobs.stage, ACTIVE_STAGES)));
    const [job] = await tx
      .insert(pageJobs)
      .values({ userId, seriesId, imageId, provider, requestedPipeline, providerRef, options, stage })
      .returning();
    await tx
      .update(images)
      .set({ status: "processing", updatedAt: now })
      .where(eq(images.id, imageId));
    return job;
  });
};

export const findActivePageJob = async (imageId: string) =>
  db.query.pageJobs.findFirst({
    where: and(eq(pageJobs.imageId, imageId), inArray(pageJobs.stage, ACTIVE_STAGES)),
    orderBy: desc(pageJobs.createdAt),
  });

export const findActivePageJobByRef = async (providerRef: string) =>
  db.query.pageJobs.findFirst({
    where: and(eq(pageJobs.providerRef, providerRef), inArray(pageJobs.stage, ACTIVE_STAGES)),
    orderBy: desc(pageJobs.createdAt),
  });

export const setPageJobStage = async (
  jobId: string,
  stage: PageJobStage,
  patch: Partial<Pick<PageJobRow, "provider" | "providerRef" | "error" | "attempts">> = {},
) => {
  await db
    .update(pageJobs)
    .set({ stage, updatedAt: new Date(), ...patch })
    .where(and(eq(pageJobs.id, jobId), inArray(pageJobs.stage, ACTIVE_STAGES)));
};

export const isPageJobActive = async (jobId: string) => {
  const job = await db.query.pageJobs.findFirst({
    where: eq(pageJobs.id, jobId),
    columns: { stage: true },
  });
  return !!job && isActiveStage(job.stage);
};

export const completePageJob = async (
  jobId: string,
  result: { usage: UsageMetadata; cost: number },
) => {
  const now = new Date();
  await db
    .update(pageJobs)
    .set({ stage: "completed", usage: result.usage, cost: result.cost, error: null, updatedAt: now, completedAt: now })
    .where(and(eq(pageJobs.id, jobId), inArray(pageJobs.stage, ACTIVE_STAGES)));
};

export const failPageJob = async (jobId: string, error: string) => {
  const now = new Date();
  const [job] = await db
    .update(pageJobs)
    .set({ stage: "failed", error: error.slice(0, 1000), updatedAt: now, completedAt: now })
    .where(and(eq(pageJobs.id, jobId), inArray(pageJobs.stage, ACTIVE_STAGES)))
    .returning();
  if (job) {
    await db
      .update(images)
      .set({ status: "error", updatedAt: now })
      .where(eq(images.id, job.imageId));
  }
  return job || null;
};

/** Cancels an active job; a page keeps its previous translation if it had one. */
export const cancelPageJob = async (jobId: string, userId: string) => {
  const now = new Date();
  const [job] = await db
    .update(pageJobs)
    .set({ stage: "cancelled", error: "Cancelled by user", updatedAt: now, completedAt: now })
    .where(and(eq(pageJobs.id, jobId), eq(pageJobs.userId, userId), inArray(pageJobs.stage, ACTIVE_STAGES)))
    .returning();
  if (!job) return null;
  if (job.provider === "local_ocr" && job.providerRef) {
    await db
      .update(localOcrJobs)
      .set({ status: "cancelled", leaseOwner: null, leaseExpiresAt: null, updatedAt: now })
      .where(and(eq(localOcrJobs.id, job.providerRef), inArray(localOcrJobs.status, ["queued", "leased", "translating"])));
  }
  const image = await db.query.images.findFirst({
    where: eq(images.id, job.imageId),
    columns: { translatedKey: true },
  });
  await db
    .update(images)
    .set({ status: image?.translatedKey ? "completed" : "idle", updatedAt: now })
    .where(eq(images.id, job.imageId));
  return job;
};

/** Interactive jobs that stopped advancing (server restart) are failed so the UI does not wait forever. */
export const sweepStalePageJobs = async () => {
  const cutoff = new Date(Date.now() - STALE_MS);
  const runningIds = [...runner.running];
  const stale = await db
    .update(pageJobs)
    .set({
      stage: "failed",
      error: "The job was interrupted by a server restart. Try again.",
      updatedAt: new Date(),
      completedAt: new Date(),
    })
    .where(
      and(
        inArray(pageJobs.provider, ["gemini", "migration"]),
        inArray(pageJobs.stage, ["detecting", "translating", "rendering"]),
        lt(pageJobs.updatedAt, cutoff),
        runningIds.length ? notInArray(pageJobs.id, runningIds) : undefined,
      ),
    )
    .returning({ imageId: pageJobs.imageId });
  if (stale.length > 0) {
    await db
      .update(images)
      .set({ status: "error", updatedAt: new Date() })
      .where(and(inArray(images.id, stale.map((job) => job.imageId)), eq(images.status, "processing")));
  }
};

export const listPageJobs = async ({ userId, seriesId }: { userId: string; seriesId: string }) => {
  await sweepStalePageJobs();
  const recent = new Date(Date.now() - RECENT_MS);
  return db.query.pageJobs.findMany({
    where: and(
      eq(pageJobs.userId, userId),
      eq(pageJobs.seriesId, seriesId),
      or(inArray(pageJobs.stage, ACTIVE_STAGES), gt(pageJobs.updatedAt, recent)),
    ),
    orderBy: desc(pageJobs.createdAt),
    limit: 500,
  });
};

// ---------------------------------------------------------------------------
// Gemini runner

const claimQueuedJob = async (jobId: string) => {
  const [job] = await db
    .update(pageJobs)
    .set({ stage: "detecting", updatedAt: new Date() })
    .where(and(eq(pageJobs.id, jobId), eq(pageJobs.stage, "queued")))
    .returning();
  return job || null;
};

const executeGeminiJob = async (jobId: string) => {
  const job = await claimQueuedJob(jobId);
  if (!job) return;

  const image = await getOwnedImage(job.imageId, job.userId);
  if (!image) {
    await failPageJob(job.id, "The page no longer exists");
    return;
  }
  const user = await db.query.users.findFirst({ where: eq(users.id, job.userId) });
  const stored = (user?.settings || {}) as Partial<TranslationSettings>;
  const settings = resolvePipelineSettings(stored, job.options || {});
  const keys = resolveActiveGeminiKeys(stored);
  if (keys.length === 0) {
    await failPageJob(job.id, "No Gemini API key configured");
    return;
  }
  const seriesRow = await db.query.series.findFirst({
    where: eq(series.id, job.seriesId),
    columns: { name: true, originalTitle: true, author: true },
  });
  const context = {
    seriesTitle: seriesRow?.name,
    originalTitle: seriesRow?.originalTitle,
    author: seriesRow?.author,
  };
  const requestedPipeline = job.requestedPipeline as "auto" | "gemini_vision";
  const hooks: PipelineHooks = {
    onStage: (stage) => setPageJobStage(job.id, stage),
    shouldContinue: () => isPageJobActive(job.id),
  };

  let attempt = job.attempts + 1;
  for (;;) {
    try {
      await db.update(pageJobs).set({ attempts: attempt, updatedAt: new Date() }).where(eq(pageJobs.id, job.id));
      const completed = await translatePageWithGemini({
        image,
        userId: job.userId,
        keys,
        settings,
        requestedPipeline,
        context,
        hooks,
      });
      await completePageJob(job.id, { usage: completed.usage, cost: completed.cost });
      return;
    } catch (error) {
      if (error instanceof PipelineCancelledError) return;
      if (!(await isPageJobActive(job.id))) return;

      if (requestedPipeline === "auto" && isEligibleAdultSafetyError(error)) {
        const failedUsage = (error as GeminiCallError).usage;
        const local = await enqueueLocalOcrJob({
          requestKey: buildLocalOcrRequestKey({
            userId: job.userId,
            imageId: job.imageId,
            targetLanguage: settings.targetLanguage,
            customInstructions: settings.customInstructions,
            primaryModel: settings.model,
            fallbackModel: settings.fallbackModel,
            pipeline: "auto",
          }),
          userId: job.userId,
          seriesId: job.seriesId,
          imageId: job.imageId,
          targetLanguage: settings.targetLanguage,
          customInstructions: settings.customInstructions,
          primaryModel: settings.model,
          fallbackModel: settings.fallbackModel,
          initialUsage: combineUsage(failedUsage ? [failedUsage] : [], settings.model, false),
          requireVerifiedAdult: true,
          pipeline: "auto",
        });
        if (local) {
          await setPageJobStage(job.id, "detecting", {
            provider: "local_ocr",
            providerRef: local.id,
            error: null,
          });
          return;
        }
      }

      if (isRetryableGeminiError(error) && attempt < MAX_ATTEMPTS) {
        const suggested = (error as GeminiCallError).retryAfterMs || 5000;
        const wait = Math.min(60_000, Math.max(5_000, suggested));
        await setPageJobStage(job.id, "detecting", {
          attempts: attempt,
          error: `Gemini is busy; retrying in ${Math.round(wait / 1000)} s`,
        });
        await sleep(wait);
        if (!(await isPageJobActive(job.id))) return;
        attempt += 1;
        continue;
      }

      const callError = error as GeminiCallError;
      const message =
        callError?.isSafetyBlocked === true
          ? "Gemini rejected this page for safety reasons. Local OCR needs a running worker and a series marked as verified adult content."
          : error instanceof Error
            ? error.message
            : "Translation failed";
      await failPageJob(job.id, message);
      return;
    }
  }
};

/** Free migration: re-typesets a v1 page from its stored bubbles. */
const executeMigrationJob = async (jobId: string) => {
  const job = await claimQueuedJob(jobId);
  if (!job) return;
  const image = await getOwnedImage(job.imageId, job.userId);
  if (!image) {
    await failPageJob(job.id, "The page no longer exists");
    return;
  }
  try {
    await setPageJobStage(job.id, "rendering");
    if (!(await isPageJobActive(job.id))) return;
    const { migrateLegacyPage } = await import("@/server/migration/legacy");
    await migrateLegacyPage(image, { apply: true });
    await completePageJob(job.id, { usage: combineUsage([], "none", false), cost: 0 });
  } catch (error) {
    await failPageJob(job.id, error instanceof Error ? error.message : String(error));
  }
};

/** Starts queued Gemini and migration jobs up to the concurrency limit. Safe to call often. */
export const pumpPageJobs = async () => {
  if (runner.pumping) return;
  runner.pumping = true;
  try {
    while (runner.running.size < GEMINI_CONCURRENCY) {
      const runningIds = [...runner.running];
      const next = await db.query.pageJobs.findFirst({
        where: and(
          inArray(pageJobs.provider, ["gemini", "migration"]),
          eq(pageJobs.stage, "queued"),
          runningIds.length ? notInArray(pageJobs.id, runningIds) : undefined,
        ),
        orderBy: asc(pageJobs.createdAt),
        columns: { id: true, provider: true },
      });
      if (!next) break;
      runner.running.add(next.id);
      const execute = next.provider === "migration" ? executeMigrationJob : executeGeminiJob;
      void execute(next.id)
        .catch((error) => {
          console.error("Page job runner crashed", next.id, error);
          return failPageJob(next.id, error instanceof Error ? error.message : String(error));
        })
        .finally(() => {
          runner.running.delete(next.id);
          void pumpPageJobs();
        });
    }
  } catch (error) {
    console.error("Page job pump failed", error);
  } finally {
    runner.pumping = false;
  }
};

/** Periodic tick: resumes queued jobs after a restart and polls batch jobs. */
export const startPageJobScheduler = (tick: () => Promise<void>, intervalMs = 20_000) => {
  if (runner.timer) return;
  runner.timer = setInterval(() => {
    void tick().catch((error) => console.error("Job scheduler tick failed", error));
  }, intervalMs);
  runner.timer.unref?.();
  void tick().catch((error) => console.error("Job scheduler tick failed", error));
};
