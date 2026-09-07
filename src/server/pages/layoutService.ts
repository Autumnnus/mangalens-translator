import { db } from "@/db";
import { images, series } from "@/db/schema";
import { scaleLayout } from "@/layout/defaults";
import { layoutFromLegacyBubbles } from "@/layout/legacy";
import { PageLayout, pageLayoutSchema } from "@/layout/types";
import {
  deleteObject,
  getObjectBuffer,
  getPresignedViewUrl,
  listObjects,
  uploadObject,
} from "@/lib/storage";
import { loadServerFonts } from "@/server/render/fonts";
import { renderPage } from "@/server/render/renderPage";
import { TextBubble } from "@/types";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";

export type OwnedImage = typeof images.$inferSelect & { seriesId: string };

export const getOwnedImage = async (
  imageId: string,
  userId: string,
): Promise<OwnedImage | null> => {
  const [row] = await db
    .select({ image: images })
    .from(images)
    .innerJoin(series, eq(images.seriesId, series.id))
    .where(and(eq(images.id, imageId), eq(series.userId, userId)))
    .limit(1);
  return row?.image ?? null;
};

export const loadOriginal = async (image: OwnedImage) => {
  const bytes = await getObjectBuffer(image.originalKey);
  if (!bytes || bytes.length === 0) {
    throw new Error("Original image is missing from storage");
  }
  return Buffer.from(bytes);
};

export const readDimensions = async (original: Buffer) => {
  const metadata = await sharp(original).rotate().metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("Original image dimensions could not be read");
  }
  return { width: metadata.width, height: metadata.height };
};

export interface LoadedLayout {
  layout: PageLayout;
  /** stored: saved v2 document; legacy: built on the fly from `bubbles`; empty: no text yet. */
  origin: "stored" | "legacy" | "empty";
  original: Buffer;
}

/**
 * Returns the page's layout, building one from the legacy bubbles when no v2
 * document has been saved yet. Nothing is written to the database here.
 */
export const loadOrBuildLayout = async (
  image: OwnedImage,
): Promise<LoadedLayout> => {
  const original = await loadOriginal(image);
  const stored = image.layout
    ? pageLayoutSchema.safeParse(image.layout)
    : null;
  if (stored?.success) {
    return { layout: stored.data, origin: "stored", original };
  }
  const { width, height } = await readDimensions(original);
  const bubbles = Array.isArray(image.bubbles)
    ? (image.bubbles as TextBubble[])
    : [];
  const layout = layoutFromLegacyBubbles(bubbles, width, height);
  return {
    layout,
    origin: bubbles.length > 0 ? "legacy" : "empty",
    original,
  };
};

export const saveLayout = async (imageId: string, layout: PageLayout) => {
  const updated: PageLayout = {
    ...layout,
    meta: { ...layout.meta, updatedAt: new Date().toISOString() },
  };
  await db
    .update(images)
    .set({ layout: updated, updatedAt: new Date() })
    .where(eq(images.id, imageId));
  return updated;
};

const extensionFor = (contentType: string) =>
  contentType === "image/png" ? "png" : "jpg";

const deleteByPrefixQuietly = async (prefix: string) => {
  try {
    const objects = await listObjects(prefix);
    await Promise.all(
      objects
        .map((object) => object.Key)
        .filter((key): key is string => !!key)
        .map((key) => deleteObject(key)),
    );
  } catch (error) {
    console.warn("Preview cleanup failed", prefix, error);
  }
};

export interface RenderResult {
  layout: PageLayout;
  key: string;
  url: string;
  width: number;
  height: number;
  contentType: string;
  applied: boolean;
}

/**
 * Renders the page. With `apply` the result becomes the page's translation:
 * the v1 render is kept under `legacy_translated_key`, the layout is stored
 * and the page is marked completed. Without it a throw-away preview is
 * uploaded and only its URL is returned.
 */
export const renderImage = async (
  image: OwnedImage,
  requestedLayout: PageLayout | null,
  options: { apply: boolean; original?: Buffer },
): Promise<RenderResult> => {
  const loaded = requestedLayout
    ? null
    : await loadOrBuildLayout(image);
  const original =
    options.original || loaded?.original || (await loadOriginal(image));
  let layout = requestedLayout || loaded!.layout;
  const dimensions = await readDimensions(original);
  layout = scaleLayout(layout, dimensions.width, dimensions.height);

  const fonts = await loadServerFonts();
  const rendered = await renderPage({ original, layout, fonts, format: "auto" });
  const extension = extensionFor(rendered.contentType);

  if (!options.apply) {
    const prefix = `${image.seriesId}/preview_${image.id}_`;
    await deleteByPrefixQuietly(prefix);
    const key = `${prefix}${Date.now()}.${extension}`;
    await uploadObject(key, rendered.image, rendered.contentType);
    return {
      layout: rendered.layout,
      key,
      url: await getPresignedViewUrl(key),
      width: rendered.width,
      height: rendered.height,
      contentType: rendered.contentType,
      applied: false,
    };
  }

  const key = `${image.seriesId}/translated_v2_${image.id}_${Date.now()}.${extension}`;
  await uploadObject(key, rendered.image, rendered.contentType);

  const previousKey = image.translatedKey || null;
  const keepLegacy =
    image.layoutVersion === 1 && previousKey && !image.legacyTranslatedKey;
  await db
    .update(images)
    .set({
      translatedKey: key,
      legacyTranslatedKey: keepLegacy
        ? previousKey
        : image.legacyTranslatedKey,
      layout: rendered.layout,
      layoutVersion: 2,
      status: "completed",
      renderedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(images.id, image.id));

  // A previous v2 render is disposable; the legacy render is never removed here.
  if (
    previousKey &&
    previousKey !== key &&
    image.layoutVersion === 2 &&
    previousKey !== image.legacyTranslatedKey
  ) {
    await deleteObject(previousKey).catch((error) =>
      console.warn("Previous render cleanup failed", previousKey, error),
    );
  }

  return {
    layout: rendered.layout,
    key,
    url: await getPresignedViewUrl(key),
    width: rendered.width,
    height: rendered.height,
    contentType: rendered.contentType,
    applied: true,
  };
};
