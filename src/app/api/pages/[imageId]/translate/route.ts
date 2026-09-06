import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { combineUsage } from "@/server/gemini/common";
import { resolveActiveGeminiKeys } from "@/server/gemini/keys";
import {
  createPageJob,
  findActivePageJob,
  pumpPageJobs,
  toPageJobSummary,
} from "@/server/jobs/pageJobs";
import { isLocalOcrConfigured } from "@/server/local-ocr/auth";
import { buildLocalOcrRequestKey, enqueueLocalOcrJob } from "@/server/local-ocr/jobs";
import { getOwnedImage } from "@/server/pages/layoutService";
import { resolvePipelineSettings } from "@/server/pipeline/translatePage";
import { TranslationSettings } from "@/types";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

type Context = { params: Promise<{ imageId: string }> };

const bodySchema = z.object({
  pipeline: z.enum(["auto", "gemini_vision", "local_ocr"]).default("auto"),
  targetLanguage: z.string().min(1).max(100).optional(),
  customInstructions: z.string().max(4000).optional(),
  model: z.string().min(1).max(100).optional(),
  fallbackModel: z.string().min(1).max(100).optional(),
  enableQualityFallback: z.boolean().optional(),
});

/**
 * Queues a page job. Work happens on the server in the background; the client
 * follows progress through GET /api/jobs. A page already being processed
 * returns its current job instead of starting another.
 */
export async function POST(request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const { imageId } = await context.params;
  if (!z.string().uuid().safeParse(imageId).success) {
    return NextResponse.json({ error: "Invalid image id" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
  }
  const image = await getOwnedImage(imageId, userId);
  if (!image) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  const existing = await findActivePageJob(image.id);
  if (existing) {
    return NextResponse.json({ job: toPageJobSummary(existing), existing: true });
  }

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  const stored = (user?.settings || {}) as Partial<TranslationSettings>;
  const keys = resolveActiveGeminiKeys(stored);
  if (keys.length === 0) {
    return NextResponse.json(
      {
        error: stored.useCustomApiKey
          ? "API key pool is empty. Please add at least one key to the pool."
          : "No system Gemini API key found.",
      },
      { status: 400 },
    );
  }
  const { pipeline, ...overrides } = parsed.data;
  const settings = resolvePipelineSettings(stored, overrides);

  if (pipeline === "local_ocr") {
    if (!isLocalOcrConfigured()) {
      return NextResponse.json({ error: "Local OCR is not configured for this server." }, { status: 503 });
    }
    const local = await enqueueLocalOcrJob({
      requestKey: buildLocalOcrRequestKey({
        userId,
        imageId: image.id,
        targetLanguage: settings.targetLanguage,
        customInstructions: settings.customInstructions,
        primaryModel: settings.model,
        fallbackModel: settings.fallbackModel,
        pipeline: "local_ocr",
      }),
      userId,
      seriesId: image.seriesId,
      imageId: image.id,
      targetLanguage: settings.targetLanguage,
      customInstructions: settings.customInstructions,
      primaryModel: settings.model,
      fallbackModel: settings.fallbackModel,
      initialUsage: combineUsage([], settings.model, false),
      requireVerifiedAdult: false,
      pipeline: "local_ocr",
    });
    if (!local) {
      return NextResponse.json({ error: "The page could not be queued for local OCR." }, { status: 404 });
    }
    const job = await createPageJob({
      userId,
      seriesId: image.seriesId,
      imageId: image.id,
      provider: "local_ocr",
      requestedPipeline: "local_ocr",
      providerRef: local.id,
      options: overrides,
      stage: "detecting",
    });
    return NextResponse.json({ job: toPageJobSummary(job) }, { status: 202 });
  }

  const job = await createPageJob({
    userId,
    seriesId: image.seriesId,
    imageId: image.id,
    provider: "gemini",
    requestedPipeline: pipeline,
    options: overrides,
  });
  void pumpPageJobs();
  return NextResponse.json({ job: toPageJobSummary(job) }, { status: 202 });
}
