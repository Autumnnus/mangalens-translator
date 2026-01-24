"use server";

import { auth } from "@/auth";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { getPresignedViewUrl } from "@/lib/storage";
import { SeriesInput } from "@/types";
import { and, asc, desc, eq, sql } from "drizzle-orm";

export async function fetchSeriesAction(
  userId?: string,
  page: number = 1,
  pageSize: number = 20,
) {
  const session = await auth();
  const id = userId || session?.user?.id;
  if (!id) return { items: [], total: 0 };

  const seriesData = await db
    .select({
      id: schema.series.id,
      name: schema.series.name,
      description: schema.series.description,
      categoryId: schema.series.categoryId,
      tags: schema.series.tags,
      createdAt: schema.series.createdAt,
      updatedAt: schema.series.updatedAt,
      sequenceNumber: schema.series.sequenceNumber,
      author: schema.series.author,
      groupName: schema.series.groupName,
      originalTitle: schema.series.originalTitle,
      imageCount: sql<number>`count(${schema.images.id})`.as("image_count"),
      completedCount:
        sql<number>`count(CASE WHEN ${schema.images.status} = 'completed' THEN 1 END)`.as(
          "completed_count",
        ),
    })
    .from(schema.series)
    .leftJoin(schema.images, eq(schema.series.id, schema.images.seriesId))
    .where(eq(schema.series.userId, id))
    .groupBy(schema.series.id)
    .orderBy(desc(schema.series.updatedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const allSeriesCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.series)
    .where(eq(schema.series.userId, id));
  const total = Number(allSeriesCount[0]?.count || 0);

  const itemsWithPreviews = await Promise.all(
    seriesData.map(async (item) => {
      const allImages = await db.query.images.findMany({
        where: eq(schema.images.seriesId, item.id),
        orderBy: schema.images.sequenceNumber,
        columns: {
          originalKey: true,
          translatedKey: true,
        },
      });

      const previewKeys: string[] = [];
      if (allImages.length > 0) {
        previewKeys.push(
          allImages[0].translatedKey || allImages[0].originalKey,
        );
        if (allImages.length > 2) {
          const mid = Math.floor(allImages.length / 2);
          previewKeys.push(
            allImages[mid].translatedKey || allImages[mid].originalKey,
          );
        }
        if (allImages.length > 1) {
          previewKeys.push(
            allImages[allImages.length - 1].translatedKey ||
              allImages[allImages.length - 1].originalKey,
          );
        }
      }

      const previewUrls = await Promise.all(
        previewKeys.map((key) => getPresignedViewUrl(key)),
      );

      return {
        ...item,
        previewImages: previewUrls,
      };
    }),
  );

  return { items: itemsWithPreviews, total };
}

export async function fetchSeriesImagesAction(seriesId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const images = await db.query.images.findMany({
    where: eq(schema.images.seriesId, seriesId),
    orderBy: asc(schema.images.sequenceNumber),
  });

  const signedImages = await Promise.all(
    images.map(async (img) => ({
      ...img,
      originalUrl: await getPresignedViewUrl(img.originalKey),
      translatedUrl: img.translatedKey
        ? await getPresignedViewUrl(img.translatedKey)
        : null,
    })),
  );

  return signedImages;
}

export async function createSeriesAction(data: SeriesInput) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  // Get max sequence number for this category/user
  const maxSeqResult = await db
    .select({
      maxSeq: sql<number>`COALESCE(MAX(${schema.series.sequenceNumber}), 0)`,
    })
    .from(schema.series)
    .where(
      and(
        eq(schema.series.userId, session.user.id),
        data.categoryId
          ? eq(schema.series.categoryId, data.categoryId)
          : sql`${schema.series.categoryId} IS NULL`,
      ),
    );

  const nextSeq = (maxSeqResult[0]?.maxSeq || 0) + 1;

  await db.insert(schema.series).values({
    ...data,
    userId: session.user.id,
    sequenceNumber: nextSeq,
  });
}

export async function updateSeriesAction(
  id: string,
  data: Partial<SeriesInput>,
) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await db
    .update(schema.series)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(
      and(eq(schema.series.id, id), eq(schema.series.userId, session.user.id)),
    );
}

export async function deleteSeriesAction(id: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const s = await db.query.series.findFirst({
    where: and(
      eq(schema.series.id, id),
      eq(schema.series.userId, session.user.id),
    ),
    with: { images: true },
  });

  if (!s) return [];

  const keys = s.images.flatMap(
    (img) => [img.originalKey, img.translatedKey].filter(Boolean) as string[],
  );

  await db.delete(schema.images).where(eq(schema.images.seriesId, id));
  await db.delete(schema.series).where(eq(schema.series.id, id));

  return keys;
}

export async function swapSeriesSequenceAction(id1: string, id2: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const [s1, s2] = await Promise.all([
    db.query.series.findFirst({
      where: and(
        eq(schema.series.id, id1),
        eq(schema.series.userId, session.user.id),
      ),
    }),
    db.query.series.findFirst({
      where: and(
        eq(schema.series.id, id2),
        eq(schema.series.userId, session.user.id),
      ),
    }),
  ]);

  if (!s1 || !s2) throw new Error("Series not found");

  const seq1 = s1.sequenceNumber || 0;
  const seq2 = s2.sequenceNumber || 0;

  await db.transaction(async (tx) => {
    await tx
      .update(schema.series)
      .set({ sequenceNumber: seq2 })
      .where(eq(schema.series.id, id1));
    await tx
      .update(schema.series)
      .set({ sequenceNumber: seq1 })
      .where(eq(schema.series.id, id2));
  });
}
