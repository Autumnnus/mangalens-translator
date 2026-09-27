import { describeError } from "@/server/errors";
import { auth } from "@/auth";
import { db } from "@/db";
import { images, series, users } from "@/db/schema";
import { pageLayoutSchema } from "@/layout/types";
import { trackModelCalls } from "@/server/llm/run";
import { aiSettingsProblem } from "@/server/llm/settings";
import { ModelCallError } from "@/server/llm/types";
import { combineUsage } from "@/server/llm/usage";
import { getOwnedImage } from "@/server/pages/layoutService";
import { ledgerRecorder } from "@/server/usage/ledger";
import { loadStoryContext, resolvePageSettings, translateRegions } from "@/server/pipeline/translatePage";
import { TranslationSettings, UsageBreakdown } from "@/types";
import { calculateUsageCost } from "@/utils/cost";
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
    const settings = resolvePageSettings(stored);
    const problem = aiSettingsProblem(settings.ai);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    const seriesRow = await db.query.series.findFirst({
      where: eq(series.id, image.seriesId),
      columns: { name: true, originalTitle: true, author: true, contentMode: true },
    });

    const { layout, regionIds } = parsed.data;
    const wanted = regionIds ? new Set(regionIds) : null;
    const targets = layout.regions
      .filter((region) =>
        wanted ? wanted.has(region.id) : !region.locked && !region.translatedText.trim(),
      )
      .map((region) => ({ ...region, locked: false }));
    if (targets.length === 0) {
      return NextResponse.json({ layout, usage: combineUsage([], settings.ai.translator.model, false), cost: 0 });
    }

    const targetIds = new Set(targets.map((region) => region.id));
    const story = await loadStoryContext(image);
    const usageEntries: UsageBreakdown[] = [];
    const recorder = ledgerRecorder({ userId, imageId: image.id });
    const translated = await trackModelCalls(recorder.observe, () =>
      translateRegions({
        settings,
        context: {
          seriesTitle: seriesRow?.name,
          originalTitle: seriesRow?.originalTitle,
          author: seriesRow?.author,
          sourceLanguage: null,
          adult: seriesRow?.contentMode === "adult_verified",
          scene: layout.meta.scene,
          story,
          pageLines: layout.regions
            .filter((region) => !targetIds.has(region.id) && region.sourceText.trim() && region.translatedText.trim())
            .map((region) => ({ speaker: region.speaker, source: region.sourceText, translation: region.translatedText })),
        },
        regions: targets,
        usage: usageEntries,
      }),
    ).finally(recorder.flush);
    const byId = new Map(translated.regions.map((region) => [region.id, region.translatedText]));
    const nextLayout = {
      ...layout,
      regions: layout.regions.map((region) =>
        byId.has(region.id) ? { ...region, translatedText: byId.get(region.id)! } : region,
      ),
      meta: { ...layout.meta, updatedAt: new Date().toISOString() },
    };

    const usage = combineUsage(usageEntries, translated.model, translated.fallbackUsed);
    const cost = calculateUsageCost(usage);
    // Bill the page: append to its usage record.
    const previous = image.usage as typeof usage | null;
    const merged = combineUsage(
      [...(previous?.breakdown || []), ...usageEntries],
      translated.model,
      !!previous?.fallbackUsed,
    );
    merged.processing = previous?.processing;
    await db
      .update(images)
      .set({ usage: merged, cost: (image.cost || 0) + cost, updatedAt: new Date() })
      .where(eq(images.id, image.id));

    return NextResponse.json({ layout: nextLayout, usage, cost });
  } catch (error) {
    console.error("Text translation failed", image.id, error);
    const statusCode = (error as ModelCallError).status;
    return NextResponse.json(
      { error: describeError(error, "Translation failed") },
      { status: typeof statusCode === "number" && statusCode >= 400 ? statusCode : 500 },
    );
  }
}
