import { db } from "@/db";
import { images, localOcrJobs, series, users } from "@/db/schema";
import { resolveActiveGeminiKeys } from "@/server/gemini/keys";
import { authenticateLocalOcrWorker } from "@/server/local-ocr/auth";
import { getOwnedImage } from "@/server/pages/layoutService";
import {
  completePageJob,
  failPageJob,
  findActivePageJobByRef,
  isPageJobActive,
  setPageJobStage,
} from "@/server/jobs/pageJobs";
import {
  completeDetectedPage,
  detectedFromLocalOcr,
  PipelineCancelledError,
} from "@/server/pipeline/translatePage";
import { loadOriginal, readDimensions } from "@/server/pages/layoutService";
import { TranslationSettings } from "@/types";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

export const maxDuration = 180;

const bubbleSchema = z.object({
  id: z.string().min(1).max(120),
  box_2d: z
    .tuple([
      z.number().min(0).max(1000),
      z.number().min(0).max(1000),
      z.number().min(0).max(1000),
      z.number().min(0).max(1000),
    ])
    .refine((box) => box[2] > box[0] && box[3] > box[1]),
  original_text: z.string().min(1).max(5000),
  confidence: z.number().min(0).max(1),
  type: z
    .enum(["speech", "thought", "caption", "sfx", "label", "dialogue", "environmental"])
    .optional(),
});

const completeSchema = z.object({
  bubbles: z.array(bubbleSchema).min(1).max(200),
  metadata: z.object({
    engine: z.string().min(1).max(120),
    device: z.string().min(1).max(120),
    durationMs: z.number().int().min(0).max(3_600_000),
    regions: z.number().int().min(1).max(200),
    mangaOcrEnabled: z.boolean(),
  }),
});

/**
 * The worker hands back OCR regions; the server translates, cleans, typesets
 * and stores the page exactly like the Gemini Vision path.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  try {
    const workerId = authenticateLocalOcrWorker(request);
    if (!workerId) {
      return NextResponse.json({ error: "Unauthorized worker" }, { status: 401 });
    }
    const parsed = completeSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid OCR result",
          issues: parsed.error.issues.slice(0, 20).map((issue) => ({
            path: issue.path.join("."),
            code: issue.code,
            message: issue.message,
          })),
        },
        { status: 400 },
      );
    }
    const { jobId } = await context.params;
    const [job] = await db
      .update(localOcrJobs)
      .set({
        status: "translating",
        ocrBubbles: parsed.data.bubbles,
        ocrMetadata: parsed.data.metadata,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(localOcrJobs.id, jobId),
          eq(localOcrJobs.status, "leased"),
          eq(localOcrJobs.leaseOwner, workerId),
        ),
      )
      .returning();
    if (!job) {
      return NextResponse.json(
        { error: "OCR job lease is no longer active" },
        { status: 409 },
      );
    }

    const pageJob = await findActivePageJobByRef(job.id);
    try {
      const image = await getOwnedImage(job.imageId, job.userId);
      if (!image) throw new Error("Image for this OCR job no longer exists");
      const user = await db.query.users.findFirst({
        where: eq(users.id, job.userId),
      });
      const stored = (user?.settings || {}) as Partial<TranslationSettings>;
      const keys = resolveActiveGeminiKeys(stored);
      if (keys.length === 0) throw new Error("No Gemini API key available");
      const seriesRow = await db.query.series.findFirst({
        where: eq(series.id, job.seriesId),
        columns: { name: true, originalTitle: true, author: true },
      });

      const original = await loadOriginal(image);
      const { width, height } = await readDimensions(original);
      const completed = await completeDetectedPage({
        image,
        userId: job.userId,
        keys,
        settings: {
          targetLanguage: job.targetLanguage,
          customInstructions: job.customInstructions || undefined,
          model: job.primaryModel,
          fallbackModel: job.fallbackModel,
          enableQualityFallback: stored.enableQualityFallback ?? true,
        },
        requestedPipeline: job.pipeline === "local_ocr" ? "local_ocr" : "auto",
        detected: detectedFromLocalOcr(parsed.data.bubbles, width, height),
        detector: {
          provider: "paddleocr",
          model: parsed.data.metadata.engine,
          workerId,
          device: parsed.data.metadata.device,
          durationMs: parsed.data.metadata.durationMs,
          mangaOcrEnabled: parsed.data.metadata.mangaOcrEnabled,
          usageEntries: job.initialUsage?.breakdown || [],
        },
        context: {
          seriesTitle: seriesRow?.name,
          originalTitle: seriesRow?.originalTitle,
          author: seriesRow?.author,
        },
        original,
        hooks: pageJob
          ? {
              onStage: (stage) => setPageJobStage(pageJob.id, stage),
              shouldContinue: () => isPageJobActive(pageJob.id),
            }
          : undefined,
      });
      if (pageJob) {
        await completePageJob(pageJob.id, { usage: completed.usage, cost: completed.cost });
      }

      await db
        .update(localOcrJobs)
        .set({
          status: "completed",
          usage: completed.usage,
          leaseExpiresAt: null,
          error: null,
          updatedAt: new Date(),
        })
        .where(eq(localOcrJobs.id, job.id));
      return NextResponse.json({ completed: true });
    } catch (error) {
      if (error instanceof PipelineCancelledError) {
        await db
          .update(localOcrJobs)
          .set({ status: "cancelled", leaseExpiresAt: null, updatedAt: new Date() })
          .where(eq(localOcrJobs.id, job.id));
        return NextResponse.json({ completed: false, cancelled: true });
      }
      const message =
        error instanceof Error ? error.message : "Page completion failed";
      await db
        .update(localOcrJobs)
        .set({
          status: "failed",
          error: message,
          leaseExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(eq(localOcrJobs.id, job.id));
      if (pageJob) await failPageJob(pageJob.id, message);
      else {
        await db
          .update(images)
          .set({ status: "error", updatedAt: new Date() })
          .where(eq(images.id, job.imageId))
          .catch(() => undefined);
      }
      return NextResponse.json({ error: message }, { status: 422 });
    }
  } catch (error) {
    console.error("Local OCR completion failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "OCR completion failed" },
      { status: 500 },
    );
  }
}
