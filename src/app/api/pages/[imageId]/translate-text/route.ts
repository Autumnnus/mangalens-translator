import { auth } from "@/auth";
import { db } from "@/db";
import { images, series, users } from "@/db/schema";
import { pageLayoutSchema } from "@/layout/types";
import { combineUsage } from "@/server/gemini/common";
import { parseGeminiStatusCode, resolveActiveGeminiKeys } from "@/server/gemini/keys";
import { getOwnedImage } from "@/server/pages/layoutService";
import {
  resolvePipelineSettings,
  translateRegions,
} from "@/server/pipeline/translatePage";
import { TranslationSettings, UsageBreakdown } from "@/types";
import { calculateGeminiCost } from "@/utils/cost";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

export const maxDuration = 120;

type Context = { params: Promise<{ imageId: string }> };

const bodySchema = z.object({
  layout: pageLayoutSchema,
  /** Only these regions; otherwise every unlocked region without a translation. */
  regionIds: z.array(z.string().min(1).max(64)).max(500).optional(),
});

/**
 * Text-only re-translation for the editor. No image is sent; the layout is
 * returned with translations filled in and nothing is stored except usage.
 */
export async function POST(request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const { imageId } = await context.params;
  if (!z.string().uuid().safeParse(imageId).success) {
    return NextResponse.json({ error: "Invalid image id" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
  }
  const image = await getOwnedImage(imageId, userId);
  if (!image) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  try {
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    const stored = (user?.settings || {}) as Partial<TranslationSettings>;
    const settings = resolvePipelineSettings(stored);
    const keys = resolveActiveGeminiKeys(stored);
    if (keys.length === 0) {
      return NextResponse.json({ error: "No Gemini API key available" }, { status: 400 });
    }
    const seriesRow = await db.query.series.findFirst({
      where: eq(series.id, image.seriesId),
      columns: { name: true, originalTitle: true, author: true },
    });

    const { layout, regionIds } = parsed.data;
    const wanted = regionIds ? new Set(regionIds) : null;
    const targets = layout.regions
      .filter((region) =>
        wanted ? wanted.has(region.id) : !region.locked && !region.translatedText.trim(),
      )
      .map((region) => ({ ...region, locked: false }));
    if (targets.length === 0) {
      return NextResponse.json({ layout, usage: combineUsage([], settings.model, false), cost: 0 });
    }

    const usageEntries: UsageBreakdown[] = [];
    const translated = await translateRegions({
      userId,
      keys,
      settings,
      context: {
        seriesTitle: seriesRow?.name,
        originalTitle: seriesRow?.originalTitle,
        author: seriesRow?.author,
        sourceLanguage: null,
      },
      regions: targets,
      usageEntries,
    });
    const byId = new Map(translated.regions.map((region) => [region.id, region.translatedText]));
    const nextLayout = {
      ...layout,
      regions: layout.regions.map((region) =>
        byId.has(region.id) ? { ...region, translatedText: byId.get(region.id)! } : region,
      ),
      meta: { ...layout.meta, updatedAt: new Date().toISOString() },
    };

    const usage = combineUsage(usageEntries, translated.modelUsed, translated.fallbackUsed);
    const cost = calculateGeminiCost(usage, settings.model);
    // Bill the page: append to its usage record.
    const previous = image.usage as typeof usage | null;
    const merged = combineUsage(
      [...(previous?.breakdown || []), ...usageEntries],
      translated.modelUsed,
      !!previous?.fallbackUsed || translated.fallbackUsed,
    );
    merged.processing = previous?.processing;
    await db
      .update(images)
      .set({ usage: merged, cost: (image.cost || 0) + cost, updatedAt: new Date() })
      .where(eq(images.id, image.id));

    return NextResponse.json({ layout: nextLayout, usage, cost });
  } catch (error) {
    console.error("Text translation failed", image.id, error);
    const statusCode = parseGeminiStatusCode(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Translation failed" },
      { status: typeof statusCode === "number" && statusCode >= 400 ? statusCode : 500 },
    );
  }
}
