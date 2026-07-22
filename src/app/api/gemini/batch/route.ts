import { auth } from "@/auth";
import { db } from "@/db";
import { images, series, translationJobs, users } from "@/db/schema";
import { getObjectData } from "@/lib/storage";
import {
  isRetryableGeminiError,
  resolveActiveGeminiKeys,
} from "@/server/gemini/keys";
import {
  buildGenerationConfig,
  buildTranslationPrompt,
  combineUsage,
  generateTranslation,
  parseTranslationResponse,
  TranslationAttemptError,
  usageFromResponse,
} from "@/server/gemini/translation";
import {
  BatchTranslationItemResult,
  BatchTranslationJobSummary,
  TranslationSettings,
  UsageBreakdown,
  UsageMetadata,
} from "@/types";
import { GoogleGenAI, InlinedRequest, JobState } from "@google/genai";
import { and, desc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const maxDuration = 300;

const MAX_INLINE_BYTES = 17 * 1024 * 1024;
const MAX_BATCH_ITEMS = 10;
const FINALIZATION_LEASE_MS = 6 * 60 * 1000;

const createSchema = z.object({
  seriesId: z.string().uuid(),
  imageIds: z.array(z.string().uuid()).min(1).max(20),
});

const fingerprintKey = (key: string) =>
  createHash("sha256").update(key).digest("hex").slice(0, 24);

const normalizeMimeType = (contentType: string | undefined, key: string) => {
  const normalized = (contentType || "").split(";", 1)[0].toLowerCase();
  if (
    [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
    ].includes(normalized)
  ) {
    return normalized;
  }

  const extension = key.split(".").pop()?.toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "heic") return "image/heic";
  if (extension === "heif") return "image/heif";
  return "image/jpeg";
};

const emptyUsage = (model: string): UsageMetadata =>
  combineUsage([], model, false);

const getUserSettingsAndKeys = async (userId: string) => {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  const settings = (user?.settings || {}) as Partial<TranslationSettings>;
  return { settings, keys: resolveActiveGeminiKeys(settings) };
};

const getJobWithOwnership = async (jobId: string, userId: string) =>
  db.query.translationJobs.findFirst({
    where: and(
      eq(translationJobs.id, jobId),
      eq(translationJobs.userId, userId),
    ),
  });

const toSummary = (
  job: typeof translationJobs.$inferSelect,
): BatchTranslationJobSummary => ({
  id: job.id,
  imageIds: job.imageIds,
  status:
    job.status === "finalizing"
      ? "running"
      : (job.status as BatchTranslationJobSummary["status"]),
  results: job.results || undefined,
  error: job.error || undefined,
});

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid batch payload" },
        { status: 400 },
      );
    }

    const ownerSeries = await db.query.series.findFirst({
      where: and(
        eq(series.id, parsed.data.seriesId),
        eq(series.userId, session.user.id),
      ),
    });
    if (!ownerSeries) {
      return NextResponse.json({ error: "Series not found" }, { status: 404 });
    }

    const requestedIds = [...new Set(parsed.data.imageIds)];
    const imageRows = await db.query.images.findMany({
      where: and(
        eq(images.seriesId, parsed.data.seriesId),
        inArray(images.id, requestedIds),
      ),
    });
    const byId = new Map(imageRows.map((image) => [image.id, image]));
    const orderedImages = requestedIds
      .map((id) => byId.get(id))
      .filter((image): image is (typeof imageRows)[number] => !!image);

    // Fail before creating an external provider job when the migration/table
    // is not ready. This avoids an untracked job followed by an interactive
    // retry and duplicate billing.
    await db
      .select({ id: translationJobs.id })
      .from(translationJobs)
      .limit(1);

    const { settings, keys } = await getUserSettingsAndKeys(session.user.id);
    if (keys.length === 0) {
      return NextResponse.json(
        { error: "No Gemini API key available" },
        { status: 400 },
      );
    }

    const model = settings.model || "gemini-2.5-flash-lite";
    const fallbackModel = settings.fallbackModel || "gemini-2.5-flash";
    const qualityFallback = settings.enableQualityFallback !== false;
    const prompt = buildTranslationPrompt(
      settings.targetLanguage || "Turkish",
      settings.customInstructions,
    );
    const itemLimit = Math.min(
      MAX_BATCH_ITEMS,
      Math.max(1, settings.batchSize || MAX_BATCH_ITEMS),
    );

    const chunks: {
      imageIds: string[];
      requests: InlinedRequest[];
      bytes: number;
    }[] = [];
    let current = { imageIds: [] as string[], requests: [] as InlinedRequest[], bytes: 0 };

    for (const image of orderedImages) {
      const object = await getObjectData(image.originalKey);
      if (!object.bytes || object.bytes.length === 0) continue;
      const base64 = Buffer.from(object.bytes).toString("base64");
      const estimatedBytes = base64.length + prompt.length + 2048;
      const exceedsCurrent =
        current.requests.length > 0 &&
        (current.bytes + estimatedBytes > MAX_INLINE_BYTES ||
          current.requests.length >= itemLimit);
      if (exceedsCurrent) {
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
              {
                inlineData: {
                  mimeType: normalizeMimeType(object.contentType, image.originalKey),
                  data: base64,
                },
              },
            ],
          },
        ],
        config: buildGenerationConfig(model),
      });
    }
    if (current.requests.length > 0) chunks.push(current);

    const createdJobs: BatchTranslationJobSummary[] = [];
    const submittedImageIds = new Set<string>();
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
            config: {
              displayName: `mangalens-${parsed.data.seriesId.slice(0, 8)}-${chunkIndex + 1}`,
            },
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
          userId: session.user.id,
          seriesId: parsed.data.seriesId,
          providerJobName,
          keyFingerprint: fingerprintKey(selectedKey),
          model,
          fallbackModel,
          prompt,
          qualityFallback: qualityFallback ? 1 : 0,
          imageIds: chunk.imageIds,
          status: "queued",
        })
        .returning();

      await db
        .update(images)
        .set({ status: "processing", updatedAt: new Date() })
        .where(inArray(images.id, chunk.imageIds));
      chunk.imageIds.forEach((id) => submittedImageIds.add(id));
      createdJobs.push(toSummary(job));
    }

    if (createdJobs.length === 0) {
      throw lastError || new Error("Gemini Batch job could not be created");
    }

    return NextResponse.json({
      jobs: createdJobs,
      rejectedImageIds: requestedIds.filter((id) => !submittedImageIds.has(id)),
    });
  } catch (error) {
    console.error("Gemini batch create error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Batch creation failed" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const jobId = request.nextUrl.searchParams.get("jobId");
    const seriesId = request.nextUrl.searchParams.get("seriesId");

    if (!jobId) {
      if (!seriesId) {
        return NextResponse.json({ error: "jobId is required" }, { status: 400 });
      }
      const jobs = await db.query.translationJobs.findMany({
        where: and(
          eq(translationJobs.userId, session.user.id),
          eq(translationJobs.seriesId, seriesId),
          inArray(translationJobs.status, [
            "queued",
            "running",
            "finalizing",
            "completed",
          ]),
        ),
        orderBy: desc(translationJobs.createdAt),
        limit: 50,
      });
      return NextResponse.json({ jobs: jobs.map(toSummary) });
    }

    const storedJob = await getJobWithOwnership(jobId, session.user.id);
    if (!storedJob) {
      return NextResponse.json({ error: "Batch job not found" }, { status: 404 });
    }
    if (storedJob.status === "completed" || storedJob.status === "failed") {
      return NextResponse.json({ job: toSummary(storedJob) });
    }
    const staleFinalizationBefore = new Date(
      Date.now() - FINALIZATION_LEASE_MS,
    );
    if (
      storedJob.status === "finalizing" &&
      storedJob.updatedAt &&
      storedJob.updatedAt > staleFinalizationBefore
    ) {
      return NextResponse.json({ job: toSummary(storedJob) });
    }

    const { keys } = await getUserSettingsAndKeys(session.user.id);
    const matchingKey = keys.find(
      (key) => fingerprintKey(key) === storedJob.keyFingerprint,
    );
    if (!matchingKey) {
      throw new Error("The API key used for this Batch job is no longer available");
    }

    const client = new GoogleGenAI({ apiKey: matchingKey });
    const providerJob = await client.batches.get({
      name: storedJob.providerJobName,
    });

    if (
      providerJob.state === JobState.JOB_STATE_FAILED ||
      providerJob.state === JobState.JOB_STATE_CANCELLED ||
      providerJob.state === JobState.JOB_STATE_EXPIRED
    ) {
      const message = providerJob.error?.message || "Gemini Batch job failed";
      const [failed] = await db
        .update(translationJobs)
        .set({ status: "failed", error: message, updatedAt: new Date() })
        .where(eq(translationJobs.id, storedJob.id))
        .returning();
      return NextResponse.json({ job: toSummary(failed) });
    }

    if (providerJob.state !== JobState.JOB_STATE_SUCCEEDED) {
      const [running] = await db
        .update(translationJobs)
        .set({ status: "running", updatedAt: new Date() })
        .where(eq(translationJobs.id, storedJob.id))
        .returning();
      return NextResponse.json({ job: toSummary(running) });
    }

    // Only one status request may parse results and invoke paid fallbacks.
    // A short lease lets a later poll recover if a server process dies midway.
    const claimCondition =
      storedJob.status === "finalizing"
        ? and(
            eq(translationJobs.id, storedJob.id),
            eq(translationJobs.status, "finalizing"),
            or(
              isNull(translationJobs.updatedAt),
              lt(translationJobs.updatedAt, staleFinalizationBefore),
            ),
          )
        : and(
            eq(translationJobs.id, storedJob.id),
            inArray(translationJobs.status, ["queued", "running"]),
          );
    const [claimedJob] = await db
      .update(translationJobs)
      .set({ status: "finalizing", updatedAt: new Date() })
      .where(claimCondition)
      .returning();
    if (!claimedJob) {
      const latest = await getJobWithOwnership(storedJob.id, session.user.id);
      if (!latest) {
        return NextResponse.json(
          { error: "Batch job not found" },
          { status: 404 },
        );
      }
      return NextResponse.json({ job: toSummary(latest) });
    }

    const inlineResponses = providerJob.dest?.inlinedResponses || [];
    const imageRows = await db.query.images.findMany({
      where: inArray(images.id, storedJob.imageIds),
    });
    const imagesById = new Map(imageRows.map((image) => [image.id, image]));
    const prompt = storedJob.prompt;
    const fallbackModel = storedJob.fallbackModel;
    const results: BatchTranslationItemResult[] = [];

    for (let index = 0; index < storedJob.imageIds.length; index += 1) {
      const imageId = storedJob.imageIds[index];
      const inline = inlineResponses[index];
      const usageEntries: UsageBreakdown[] = [];
      let primaryParsed: ReturnType<typeof parseTranslationResponse> | null = null;
      let primaryError: string | undefined;

      try {
        if (!inline?.response) {
          throw new Error(inline?.error?.message || "Empty Batch response");
        }
        usageEntries.push(
          usageFromResponse(inline.response, storedJob.model, "batch"),
        );
        if (!inline.response.text) {
          throw new Error(inline?.error?.message || "Empty Batch response");
        }
        primaryParsed = parseTranslationResponse(inline.response.text);
      } catch (error) {
        primaryError = error instanceof Error ? error.message : String(error);
      }

      const needsFallback =
        !primaryParsed ||
        (storedJob.qualityFallback === 1 &&
          primaryParsed.shouldFallback &&
          fallbackModel !== storedJob.model);

      if (needsFallback) {
        const image = imagesById.get(imageId);
        let fallbackSucceeded = false;
        if (image) {
          const object = await getObjectData(image.originalKey);
          if (object.bytes && object.bytes.length > 0) {
            for (const key of keys) {
              try {
                const fallback = await generateTranslation({
                  apiKey: key,
                  modelName: fallbackModel,
                  base64Image: Buffer.from(object.bytes).toString("base64"),
                  mimeType: normalizeMimeType(object.contentType, image.originalKey),
                  prompt,
                });
                usageEntries.push(fallback.usage);
                results.push({
                  imageId,
                  bubbles: fallback.parsed.bubbles,
                  usage: combineUsage(usageEntries, fallbackModel, true),
                });
                fallbackSucceeded = true;
                break;
              } catch (error) {
                const failedUsage = (error as TranslationAttemptError).usage;
                if (failedUsage) usageEntries.push(failedUsage);
                primaryError = error instanceof Error ? error.message : String(error);
                if (!isRetryableGeminiError(error)) break;
              }
            }
          }
        }
        if (fallbackSucceeded) continue;
      }

      if (primaryParsed) {
        results.push({
          imageId,
          bubbles: primaryParsed.bubbles,
          usage: combineUsage(usageEntries, storedJob.model, false),
        });
      } else {
        results.push({
          imageId,
          bubbles: [],
          usage: emptyUsage(storedJob.model),
          error: primaryError || "Translation failed",
        });
      }
    }

    const [completed] = await db
      .update(translationJobs)
      .set({ status: "completed", results, updatedAt: new Date() })
      .where(eq(translationJobs.id, storedJob.id))
      .returning();
    return NextResponse.json({ job: toSummary(completed) });
  } catch (error) {
    console.error("Gemini batch status error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Batch status failed" },
      { status: 500 },
    );
  }
}
