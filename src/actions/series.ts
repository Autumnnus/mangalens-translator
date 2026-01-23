/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import { auth } from "@/auth";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { getPresignedViewUrl } from "@/lib/storage";
import { and, desc, eq } from "drizzle-orm";

export async function fetchSeriesAction(
  userId?: string,
  page: number = 1,
  pageSize: number = 20,
) {
  const session = await auth();
  const id = userId || session?.user?.id;
  if (!id) return { items: [], total: 0 };

  const seriesData = await db.query.series.findMany({
    where: eq(schema.series.userId, id),
    orderBy: [desc(schema.series.updatedAt)],
    limit: pageSize,
    offset: (page - 1) * pageSize,
    with: {
      images: {
        orderBy: desc(schema.images.sequenceNumber),
      },
    },
  });

  // Get total for the user
  const allSeries = await db
    .select({ id: schema.series.id })
    .from(schema.series)
    .where(eq(schema.series.userId, id));
  const total = allSeries.length;

  // Transform and Sign URLs
  const enrichedSeries = await Promise.all(
    seriesData.map(async (s) => {
      const imagesWithUrls = await Promise.all(
        s.images.map(async (img) => ({
          ...img,
          originalUrl: await getPresignedViewUrl(img.originalKey),
          translatedUrl: img.translatedKey
            ? await getPresignedViewUrl(img.translatedKey)
            : null,
        })),
      );

      return {
        ...s,
        images: imagesWithUrls,
      };
    }),
  );

  return { items: enrichedSeries, total };
}

export async function createSeriesAction(data: any) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await db.insert(schema.series).values({
    ...data,
    userId: session.user.id,
  });
}

export async function updateSeriesAction(id: string, data: any) {
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

  const images = await db.query.images.findMany({
    where: eq(schema.images.seriesId, id),
  });

  const keys = images.flatMap(
    (img) => [img.originalKey, img.translatedKey].filter(Boolean) as string[],
  );

  await db
    .delete(schema.series)
    .where(
      and(eq(schema.series.id, id), eq(schema.series.userId, session.user.id)),
    );

  return keys;
}
