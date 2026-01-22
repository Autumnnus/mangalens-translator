"use server";

import { auth } from "@/auth";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";

export async function addImageAction(seriesId: string, data: any) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await db.insert(schema.images).values({
    seriesId,
    fileName: data.fileName,
    originalKey: data.originalKey,
    status: data.status || "idle",
    sequenceNumber: data.sequenceNumber || 0,
  });
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

export async function updateImageAction(imageId: string, data: any) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  // We can join series to verify ownership if needed, but RLS/Where clause on update is tricky without join.
  // For now, assume if ID matches and we don't have row-level permissions on images table, we trust the ID.
  // Better: Ensure the image belongs to a series owned by user.

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
