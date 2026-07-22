import { createHash } from "crypto";
import {
  getObjectBuffer,
  getObjectMetadata,
  uploadObject,
} from "../../lib/storage";
import sharp from "sharp";

export const THUMBNAIL_PRESETS = [
  { width: 120, quality: 62 },
  { width: 160, quality: 66 },
  { width: 180, quality: 66 },
  { width: 220, quality: 68 },
  { width: 420, quality: 76 },
  { width: 512, quality: 72 },
] as const;

export const getThumbnailCacheKey = (
  sourceKey: string,
  width: number,
  quality: number,
  sourceVersion: string,
) => {
  const seriesId = sourceKey.split("/")[0] || "unknown";
  const digest = createHash("sha1")
    .update(`${sourceKey}:${sourceVersion}`)
    .digest("hex")
    .slice(0, 20);
  return `${seriesId}/thumbnails/w${width}_q${quality}/${digest}.webp`;
};

export const createThumbnail = async (
  source: Uint8Array,
  width: number,
  quality: number,
) =>
  sharp(source)
    .rotate()
    .resize({ width, fit: "inside", withoutEnlargement: true })
    .webp({ quality })
    .toBuffer();

export const getOrCreateThumbnail = async (
  sourceKey: string,
  width: number,
  quality: number,
) => {
  const metadata = await getObjectMetadata(sourceKey);
  const sourceVersion =
    metadata.eTag || metadata.lastModified?.getTime().toString() || "current";
  const thumbnailKey = getThumbnailCacheKey(
    sourceKey,
    width,
    quality,
    sourceVersion,
  );

  const cached = await getObjectBuffer(thumbnailKey).catch(() => undefined);
  if (cached) return { thumbnail: Buffer.from(cached), cacheHit: true };

  const source = await getObjectBuffer(sourceKey);
  if (!source) throw new Error(`Image object not found: ${sourceKey}`);

  const thumbnail = await createThumbnail(source, width, quality);
  await uploadObject(thumbnailKey, thumbnail, "image/webp");

  return { thumbnail, cacheHit: false };
};
