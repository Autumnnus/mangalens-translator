"use server";

import { auth } from "@/auth";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { ImageUpdateInput } from "@/types";
import { eq } from "drizzle-orm";

export async function addImageAction(seriesId: string, data: ImageUpdateInput) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await db.insert(schema.images).values({
    seriesId,
    fileName: data.fileName || "unknown",
    originalKey: data.originalKey || "",
    status: data.status || "idle",
    sequenceNumber: data.sequenceNumber || 0,
  });
}

export async function addImagesAction(
  seriesId: string,
  items: ImageUpdateInput[],
) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  if (items.length === 0) return;

  await db.insert(schema.images).values(
    items.map((item) => ({
      seriesId,
      fileName: item.fileName || "unknown",
      originalKey: item.originalKey || "",
      status: item.status || "idle",
      sequenceNumber: item.sequenceNumber || 0,
      bubbles: item.bubbles || [],
      usage: item.usage || null,
      cost: item.cost || 0,
    })),
  );
}

export async function deleteImageAction(imageId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const img = await db.query.images.findFirst({
    where: eq(schema.images.id, imageId),
    with: { series: true },
  });

  if (!img || img.series.userId !== session.user.id) return null;

  await db.delete(schema.images).where(eq(schema.images.id, imageId));

  return [img.originalKey, img.translatedKey].filter(Boolean) as string[];
}

export async function updateImageAction(
  imageId: string,
  data: Partial<ImageUpdateInput>,
) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  // Check ownership
  const img = await db.query.images.findFirst({
    where: eq(schema.images.id, imageId),
    with: { series: true },
  });

  if (!img || img.series.userId !== session.user.id)
    throw new Error("Unauthorized");

  await db
    .update(schema.images)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(schema.images.id, imageId));
}

export async function reorderImagesAction(imageIds: string[]) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await db.transaction(async (tx) => {
    for (let i = 0; i < imageIds.length; i++) {
      await tx
        .update(schema.images)
        .set({
          sequenceNumber: i + 1,
          updatedAt: new Date(),
        })
        .where(eq(schema.images.id, imageIds[i]));
    }
  });
}
