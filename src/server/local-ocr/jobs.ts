import { db } from "@/db";
import { images, localOcrJobs, series } from "@/db/schema";
import { UsageMetadata } from "@/types";
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
