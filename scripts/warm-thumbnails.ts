import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { asc, inArray, sql } from "drizzle-orm";
import { db, client } from "../src/db";
import { images, series } from "../src/db/schema";
import {
  getOrCreateThumbnail,
  THUMBNAIL_PRESETS,
} from "../src/server/images/thumbnails";

type WarmMode = "previews" | "all";

const mode: WarmMode = process.argv.includes("--all") ? "all" : "previews";
const dryRun = process.argv.includes("--dry-run");
const concurrencyArg = process.argv.find((arg) => arg.startsWith("--concurrency="));
const concurrency = Math.max(
  1,
  Math.min(
    Number.parseInt(concurrencyArg?.split("=")[1] || "", 10) || 4,
    12,
  ),
);

const preferredKey = sql<string>`COALESCE(NULLIF(${images.translatedKey}, ''), ${images.originalKey})`;

async function collectPreviewKeys() {
  const seriesRows = await db.select({ id: series.id }).from(series);
  const seriesIds = seriesRows.map((row) => row.id);
  if (seriesIds.length === 0) return [];

  const rankedImages = db
    .select({
      seriesId: images.seriesId,
      previewKey: preferredKey.as("preview_key"),
      rowNumber:
        sql<number>`ROW_NUMBER() OVER (PARTITION BY ${images.seriesId} ORDER BY ${images.sequenceNumber} ASC, ${images.createdAt} ASC)`.as(
          "row_number",
        ),
      imageCount:
        sql<number>`COUNT(*) OVER (PARTITION BY ${images.seriesId})`.as(
          "image_count",
        ),
    })
    .from(images)
    .where(inArray(images.seriesId, seriesIds))
    .as("ranked_images");

  const rows = await db
    .select({
      previewKey: rankedImages.previewKey,
      rowNumber: rankedImages.rowNumber,
    })
    .from(rankedImages)
    .where(
      sql`${rankedImages.rowNumber} IN (1, ${rankedImages.imageCount}, FLOOR(${rankedImages.imageCount}::numeric / 2)::bigint + 1)`,
    )
    .orderBy(rankedImages.rowNumber);

  return rows.map((row) => row.previewKey).filter(Boolean);
}

async function collectAllKeys() {
  const rows = await db
    .select({
      originalKey: images.originalKey,
      preferredKey: preferredKey.as("preferred_key"),
    })
    .from(images)
    .orderBy(asc(images.seriesId), asc(images.sequenceNumber));

  return rows.flatMap((row) => [row.preferredKey, row.originalKey]).filter(Boolean);
}

async function runWithConcurrency<T>(
  items: T[],
  worker: (item: T, index: number) => Promise<void>,
) {
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      await worker(items[index], index);
    }
  });

  await Promise.all(workers);
}

async function warmThumbnails() {
  const rawKeys = mode === "all" ? await collectAllKeys() : await collectPreviewKeys();
  const keys = Array.from(new Set(rawKeys));
  const jobs = keys.flatMap((key) =>
    THUMBNAIL_PRESETS.map((preset) => ({ key, ...preset })),
  );

  console.log(
    `Warming ${jobs.length} thumbnails for ${keys.length} image keys ` +
      `in ${mode} mode with concurrency ${concurrency}${dryRun ? " (dry run)" : ""}.`,
  );

  if (dryRun) {
    console.log("Dry run complete. No thumbnails were read or written.");
    return;
  }

  let warmed = 0;
  let cacheHits = 0;
  let failed = 0;

  await runWithConcurrency(jobs, async (job, index) => {
    try {
      const result = await getOrCreateThumbnail(job.key, job.width, job.quality);
      warmed += 1;
      if (result.cacheHit) cacheHits += 1;

      if ((index + 1) % 50 === 0 || index === jobs.length - 1) {
        console.log(
          `Progress ${index + 1}/${jobs.length} ` +
            `(hits: ${cacheHits}, created: ${warmed - cacheHits}, failed: ${failed})`,
        );
      }
    } catch (error) {
      failed += 1;
      console.error(
        `Failed ${job.key} w${job.width} q${job.quality}:`,
        error instanceof Error ? error.message : error,
      );
    }
  });

  console.log(
    `Done. Success: ${warmed}, cache hits: ${cacheHits}, created: ${
      warmed - cacheHits
    }, failed: ${failed}.`,
  );
}

warmThumbnails()
  .catch((error) => {
    console.error("Thumbnail warm-up failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end({ timeout: 5 });
  });
