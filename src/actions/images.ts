"use server";

import { auth } from "@/auth";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { ImageUpdateInput } from "@/types";
import { eq, inArray } from "drizzle-orm";

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

  try {
    await db.transaction(async (tx) => {
      const values = items.map((item) => ({
        seriesId,
        fileName: item.fileName || "unknown",
        originalKey: item.originalKey || "",
        status: item.status || "idle",
        sequenceNumber: item.sequenceNumber || 0,
        bubbles: item.bubbles || [],
        usage: item.usage || null,
        cost: item.cost || 0,
      }));

      await tx.insert(schema.images).values(values);
    });
  } catch (error) {
    console.error(`Failed to insert ${items.length} images:`, error);
    throw new Error(
      `Database insert failed for ${items.length} images: ${String(error)}`,
    );
  }
}

export async function deleteImageAction(imageId: string) {
  const deleted = await deleteImagesAction([imageId]);
  return deleted;
}

/**
 * Deletes only images owned by the current user and returns their storage keys
 * so the client can remove the corresponding objects from storage as well.
 */
export async function deleteImagesAction(imageIds: string[]) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  const userId = session.user.id;

  const uniqueImageIds = [...new Set(imageIds)].filter(Boolean);
  if (uniqueImageIds.length === 0) return [];

  const imagesToDelete = await db.query.images.findMany({
    where: inArray(schema.images.id, uniqueImageIds),
    with: { series: true },
  });

  if (
    imagesToDelete.length !== uniqueImageIds.length ||
    imagesToDelete.some((image) => image.series.userId !== userId)
  ) {
    throw new Error("Unauthorized");
  }

  await db
    .delete(schema.images)
    .where(inArray(schema.images.id, uniqueImageIds));

  return imagesToDelete.flatMap((image) =>
    [image.originalKey, image.translatedKey].filter(Boolean),
  ) as string[];
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
