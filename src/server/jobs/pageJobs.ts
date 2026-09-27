import { db } from "@/db";
import { images, pageJobs, series, users } from "@/db/schema";
import { aiSettingsProblem } from "@/server/llm/settings";
import { isRetryable, ModelCallError } from "@/server/llm/types";
import { combineUsage } from "@/server/llm/usage";
import { getOwnedImage } from "@/server/pages/layoutService";
import {
  PipelineCancelledError,
  PipelineHooks,
  resolvePageSettings,
  translatePage,
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
 * The single job model behind every translation. The UI creates a page job
 * and polls this table; an in-process runner with a small concurrency limit
 * executes them, so "Translate All" keeps going after the tab is closed.
 *
 * Providers "ai" (current), "migration" (free legacy re-typeset) are run.
 * "gemini" rows from before the provider-neutral pipeline run the same way;
 * "gemini_batch" and "local_ocr" rows are history only.
 */

/** Job providers the runner executes. */
const RUNNABLE_PROVIDERS = ["ai", "gemini", "migration"];

export type PageJobRow = typeof pageJobs.$inferSelect;

export const ACTIVE_STAGES: PageJobStage[] = ["queued", "detecting", "translating", "rendering"];
export const isActiveStage = (stage: string) => (ACTIVE_STAGES as string[]).includes(stage);

const CONCURRENCY = 2;
const MAX_ATTEMPTS = 3;
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
  requestedPipeline: string;
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

/**
 * Jobs that stopped advancing (server restart) are failed so the UI does not
 * wait forever. Jobs of removed providers (Gemini Batch, local OCR worker)
 * can no longer finish and are cancelled; their pages keep what they had.
 */
export const sweepStalePageJobs = async () => {
  const retired = await db
    .update(pageJobs)
    .set({ stage: "cancelled", error: "This translation path was removed. Translate the page again.", updatedAt: new Date(), completedAt: new Date() })
    .where(and(notInArray(pageJobs.provider, RUNNABLE_PROVIDERS), inArray(pageJobs.stage, ACTIVE_STAGES)))
    .returning({ imageId: pageJobs.imageId });
  for (const { imageId } of retired) {
    const image = await db.query.images.findFirst({ where: eq(images.id, imageId), columns: { translatedKey: true } });
    await db
      .update(images)
      .set({ status: image?.translatedKey ? "completed" : "idle", updatedAt: new Date() })
      .where(and(eq(images.id, imageId), eq(images.status, "processing")));
  }
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
        inArray(pageJobs.provider, RUNNABLE_PROVIDERS),
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

const executeAiJob = async (jobId: string) => {
  const job = await claimQueuedJob(jobId);
  if (!job) return;

  const image = await getOwnedImage(job.imageId, job.userId);
  if (!image) {
    await failPageJob(job.id, "The page no longer exists");
    return;
  }
  const user = await db.query.users.findFirst({ where: eq(users.id, job.userId) });
  const stored = (user?.settings || {}) as Partial<TranslationSettings>;
  const settings = resolvePageSettings(stored, job.options || {});
  const problem = aiSettingsProblem(settings.ai);
  if (problem) {
    await failPageJob(job.id, problem);
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
  const hooks: PipelineHooks = {
    onStage: (stage) => setPageJobStage(job.id, stage),
    shouldContinue: () => isPageJobActive(job.id),
  };

  let attempt = job.attempts + 1;
  for (;;) {
    try {
      await db.update(pageJobs).set({ attempts: attempt, updatedAt: new Date() }).where(eq(pageJobs.id, job.id));
      const completed = await translatePage({ image, settings, context, hooks });
      await completePageJob(job.id, { usage: completed.usage, cost: completed.cost });
      return;
    } catch (error) {
      if (error instanceof PipelineCancelledError) return;
      if (!(await isPageJobActive(job.id))) return;
      // The model runner already retried inside the call; a second round
      // after a pause covers longer outages.
      if (isRetryable(error) && attempt < MAX_ATTEMPTS) {
        const wait = Math.min(60_000, Math.max(10_000, (error as ModelCallError).retryAfterMs || 20_000));
        await setPageJobStage(job.id, "detecting", {
          attempts: attempt,
          error: `The AI provider is busy; retrying in ${Math.round(wait / 1000)} s`,
        });
        await sleep(wait);
        if (!(await isPageJobActive(job.id))) return;
        attempt += 1;
        continue;
      }
      await failPageJob(job.id, error instanceof Error ? error.message : "Translation failed");
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

/** Starts queued jobs up to the concurrency limit. Safe to call often. */
export const pumpPageJobs = async () => {
  if (runner.pumping) return;
  runner.pumping = true;
  try {
    while (runner.running.size < CONCURRENCY) {
      const runningIds = [...runner.running];
      const next = await db.query.pageJobs.findFirst({
        where: and(
          inArray(pageJobs.provider, RUNNABLE_PROVIDERS),
          eq(pageJobs.stage, "queued"),
          runningIds.length ? notInArray(pageJobs.id, runningIds) : undefined,
        ),
        orderBy: asc(pageJobs.createdAt),
        columns: { id: true, provider: true },
      });
      if (!next) break;
      runner.running.add(next.id);
      const execute = next.provider === "migration" ? executeMigrationJob : executeAiJob;
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

/** Periodic tick: resumes queued jobs after a restart and sweeps stale ones. */
export const startPageJobScheduler = (tick: () => Promise<void>, intervalMs = 20_000) => {
  if (runner.timer) return;
  runner.timer = setInterval(() => {
    void tick().catch((error) => console.error("Job scheduler tick failed", error));
  }, intervalMs);
  runner.timer.unref?.();
  void tick().catch((error) => console.error("Job scheduler tick failed", error));
};
