import { db } from "@/db";
import { localOcrJobs } from "@/db/schema";
import { authenticateLocalOcrWorker } from "@/server/local-ocr/auth";
import { translateLocalOcrResult } from "@/server/local-ocr/jobs";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

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
    .enum(["speech", "caption", "sfx", "label", "dialogue", "environmental"])
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

    try {
      const translated = await translateLocalOcrResult(
        job,
        parsed.data.bubbles,
        parsed.data.metadata,
      );
      await db
        .update(localOcrJobs)
        .set({
          status: "completed",
          translatedBubbles: translated.bubbles,
          usage: translated.usage,
          leaseExpiresAt: null,
          error: null,
          updatedAt: new Date(),
        })
        .where(eq(localOcrJobs.id, job.id));
      return NextResponse.json({ completed: true });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Text-only translation failed";
      await db
        .update(localOcrJobs)
        .set({
          status: "failed",
          error: message,
          leaseExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(eq(localOcrJobs.id, job.id));
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
