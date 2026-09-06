import { db } from "@/db";
import { images, series } from "@/db/schema";
import { deleteObject } from "@/lib/storage";
import { createPageJob, pumpPageJobs } from "@/server/jobs/pageJobs";
import {
  loadOrBuildLayout,
  OwnedImage,
  renderImage,
  RenderResult,
} from "@/server/pages/layoutService";
import { and, eq, isNotNull, sql } from "drizzle-orm";

/**
 * Moving pages from the flattened v1 renders to layout v2. The v1 pages keep
 * their original image and the old `bubbles` array, so most of them can be
 * re-typeset without any model call; the old render is kept aside until the
 * user drops it.
 */

export type MigrationStrategy = "legacy" | "redetect";

export const isLegacyPage = (image: Pick<OwnedImage, "layoutVersion" | "translatedKey">) =>
  image.layoutVersion === 1 && !!image.translatedKey;

/** Re-typesets a v1 page from its stored bubbles (or a layout saved in the editor). */
export const migrateLegacyPage = async (
  image: OwnedImage,
  options: { apply: boolean },
): Promise<RenderResult> => {
  const loaded = await loadOrBuildLayout(image);
  if (loaded.origin === "empty") {
    throw new Error("Bu sayfada eski baloncuk verisi yok; Gemini ile yeniden tespit gerekir.");
  }
  return renderImage(image, loaded.layout, { apply: options.apply, original: loaded.original });
};

/** Puts the v1 render back in front. The v2 layout stays saved for later. */
export const revertLegacyPage = async (image: OwnedImage) => {
  if (!image.legacyTranslatedKey) {
    throw new Error("Bu sayfanın saklanan eski render'ı yok.");
  }
  const v2Key = image.translatedKey;
  await db
    .update(images)
    .set({
      translatedKey: image.legacyTranslatedKey,
      legacyTranslatedKey: null,
      layoutVersion: 1,
      renderedAt: null,
      status: "completed",
      updatedAt: new Date(),
    })
    .where(eq(images.id, image.id));
  if (v2Key && v2Key !== image.legacyTranslatedKey) {
    await deleteObject(v2Key).catch((error) => console.warn("v2 render cleanup failed", v2Key, error));
  }
};

/** Deletes the kept v1 render of a migrated page. */
export const dropLegacyRender = async (image: OwnedImage) => {
  if (!image.legacyTranslatedKey) return false;
  if (image.legacyTranslatedKey !== image.translatedKey) {
    await deleteObject(image.legacyTranslatedKey).catch((error) =>
      console.warn("Legacy render cleanup failed", image.legacyTranslatedKey, error),
    );
  }
  await db
    .update(images)
    .set({ legacyTranslatedKey: null, updatedAt: new Date() })
    .where(eq(images.id, image.id));
  return true;
};

export interface MigrationStats {
  total: number;
  /** v1 pages that can be migrated for free (have bubbles). */
  legacy: number;
  /** v1 pages with a render but no bubble data (need re-detection). */
  legacyWithoutBubbles: number;
  /** v2 pages still holding their old render for review. */
  migrated: number;
}

export const getMigrationStats = async (seriesId: string, userId: string): Promise<MigrationStats> => {
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      legacy: sql<number>`count(*) filter (where ${images.layoutVersion} = 1 and ${images.translatedKey} is not null and jsonb_typeof(${images.bubbles}) = 'array' and jsonb_array_length(${images.bubbles}) > 0)::int`,
      legacyWithoutBubbles: sql<number>`count(*) filter (where ${images.layoutVersion} = 1 and ${images.translatedKey} is not null and (${images.bubbles} is null or jsonb_typeof(${images.bubbles}) <> 'array' or jsonb_array_length(${images.bubbles}) = 0))::int`,
      migrated: sql<number>`count(*) filter (where ${images.layoutVersion} = 2 and ${images.legacyTranslatedKey} is not null)::int`,
    })
    .from(images)
    .innerJoin(series, eq(images.seriesId, series.id))
    .where(and(eq(images.seriesId, seriesId), eq(series.userId, userId)));
  return row || { total: 0, legacy: 0, legacyWithoutBubbles: 0, migrated: 0 };
};

/** Queues page jobs for every eligible v1 page of a series. */
export const startSeriesMigration = async ({
  userId,
  seriesId,
  strategy,
  imageIds,
}: {
  userId: string;
  seriesId: string;
  strategy: MigrationStrategy;
  imageIds?: string[];
}) => {
  const rows = await db
    .select({
      id: images.id,
      hasBubbles: sql<boolean>`jsonb_typeof(${images.bubbles}) = 'array' and jsonb_array_length(${images.bubbles}) > 0`,
    })
    .from(images)
    .innerJoin(series, eq(images.seriesId, series.id))
    .where(
      and(
        eq(images.seriesId, seriesId),
        eq(series.userId, userId),
        eq(images.layoutVersion, 1),
        isNotNull(images.translatedKey),
      ),
    )
    .orderBy(images.sequenceNumber);
  const wanted = imageIds ? new Set(imageIds) : null;
  let queued = 0;
  let skipped = 0;
  for (const row of rows) {
    if (wanted && !wanted.has(row.id)) continue;
    if (strategy === "legacy" && !row.hasBubbles) {
      skipped += 1;
      continue;
    }
    await createPageJob({
      userId,
      seriesId,
      imageId: row.id,
      provider: strategy === "legacy" ? "migration" : "gemini",
      requestedPipeline: "auto",
    });
    queued += 1;
  }
  if (queued > 0) void pumpPageJobs();
  return { queued, skipped };
};

/** Deletes every kept v1 render of a series' migrated pages. */
export const dropSeriesLegacyRenders = async (seriesId: string, userId: string) => {
  const rows = await db
    .select({ image: images })
    .from(images)
    .innerJoin(series, eq(images.seriesId, series.id))
    .where(
      and(
        eq(images.seriesId, seriesId),
        eq(series.userId, userId),
        eq(images.layoutVersion, 2),
        isNotNull(images.legacyTranslatedKey),
      ),
    );
  let deleted = 0;
  for (const { image } of rows) {
    if (await dropLegacyRender(image)) deleted += 1;
  }
  return { deleted };
};
