import { db } from "@/db";
import { images } from "@/db/schema";
import { createLayout, createRegion } from "@/layout/defaults";
import { PageLayout, pageLayoutSchema, Region } from "@/layout/types";
import { detectTextBlocks } from "@/server/detect/textDetector";
import { resolveAiSettings } from "@/server/llm/settings";
import { combineUsage } from "@/server/llm/usage";
import { loadOriginal, OwnedImage, readDimensions, renderImage, RenderResult } from "@/server/pages/layoutService";
import { AiSettings, TranslationSettings, UsageBreakdown, UsageMetadata } from "@/types";
import { calculateUsageCost } from "@/utils/cost";
import { eq } from "drizzle-orm";
import { DetectedRegion, readBlocks } from "./read";
import { TranslationContext, translateItems } from "./translate";

/**
 * The page pipeline:
 *
 *   detect  pixel text detector -> blocks of lettering with exact boxes
 *   read    vision model transcribes each block from its own crop
 *   translate  text model translates every item of the page in one call
 *   render  cleaning + typesetting from the layout document (no model)
 *
 * Coordinates only ever come from pixels; models only supply text. The
 * provider behind each model stage is whatever the user configured.
 */

export interface PageSettings {
  ai: AiSettings;
  targetLanguage: string;
  customInstructions?: string;
}

export interface PageOverrides {
  targetLanguage?: string;
  customInstructions?: string;
}

export const resolvePageSettings = (
  stored: Partial<TranslationSettings>,
  overrides: PageOverrides = {},
): PageSettings => ({
  ai: resolveAiSettings(stored),
  targetLanguage: overrides.targetLanguage || stored.targetLanguage || "Turkish",
  customInstructions: overrides.customInstructions ?? stored.customInstructions ?? undefined,
});

export interface CompletedPage {
  render: RenderResult;
  usage: UsageMetadata;
  cost: number;
}

export type PipelineStage = "detecting" | "translating" | "rendering";

/** Progress and cancellation hooks used by the job runner. */
export interface PipelineHooks {
  onStage?: (stage: PipelineStage) => Promise<void> | void;
  /** Returning false aborts before the next paid or destructive step. */
  shouldContinue?: () => Promise<boolean> | boolean;
}

export class PipelineCancelledError extends Error {
  constructor() {
    super("Page job was cancelled");
    this.name = "PipelineCancelledError";
  }
}

const checkpoint = async (hooks: PipelineHooks | undefined, stage: PipelineStage) => {
  if (hooks?.shouldContinue && !(await hooks.shouldContinue())) throw new PipelineCancelledError();
  await hooks?.onStage?.(stage);
};

const boxIou = (a: Region["textBox"], b: Region["textBox"]) => {
  const iw = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const ih = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const intersection = iw * ih;
  return intersection / Math.max(1, a.w * a.h + b.w * b.h - intersection);
};

/**
 * Manual edits survive re-translation: locked regions from the stored layout
 * are kept and any freshly detected region that overlaps them is dropped.
 */
export const mergeWithLocked = (existing: PageLayout | null, detected: Region[]): Region[] => {
  const locked = existing?.regions.filter((region) => region.locked) || [];
  if (locked.length === 0) return detected;
  const kept = detected.filter(
    (region) => !locked.some((lockedRegion) => boxIou(lockedRegion.textBox, region.textBox) > 0.35),
  );
  return [...locked, ...kept].sort((a, b) => a.order - b.order);
};

export const regionsFromReading = (detected: DetectedRegion[], pageLanguage?: string): Region[] =>
  detected.map((item, index) =>
    createRegion({
      id: `r_${index + 1}`,
      kind: item.kind,
      order: item.order ?? index,
      textBox: item.textBox,
      sourceText: item.sourceText,
      translatedText: "",
      source: "ai",
      confidence: item.confidence,
      textBoxPrecise: true,
      sourceLineHeight: item.lineHeight,
      pageLanguage,
    }),
  );

/** Translates every unlocked region that has source text. */
export const translateRegions = async ({
  settings,
  context,
  regions,
  usage,
}: {
  settings: PageSettings;
  context?: TranslationContext;
  regions: Region[];
  usage: UsageBreakdown[];
}) => {
  const items = regions
    .filter((region) => !region.locked && region.sourceText.trim())
    .map((region) => ({ id: region.id, kind: region.kind, text: region.sourceText }));
  const { translations, model } = await translateItems({
    ai: settings.ai,
    targetLanguage: settings.targetLanguage,
    customInstructions: settings.customInstructions,
    context,
    items,
    usage,
  });
  return {
    model,
    regions: regions.map((region) =>
      translations.has(region.id) ? { ...region, translatedText: translations.get(region.id)! } : region,
    ),
  };
};

const providerName = (ai: AiSettings, providerId: string) =>
  ai.providers.find((provider) => provider.id === providerId)?.name || providerId;

export const translatePage = async ({
  image,
  settings,
  context,
  hooks,
}: {
  image: OwnedImage;
  settings: PageSettings;
  context?: TranslationContext;
  hooks?: PipelineHooks;
}): Promise<CompletedPage> => {
  await checkpoint(hooks, "detecting");
  const original = await loadOriginal(image);
  const { width, height } = await readDimensions(original);
  const usage: UsageBreakdown[] = [];

  const detection = await detectTextBlocks(original);
  const reading =
    detection.blocks.length > 0
      ? await readBlocks({ ai: settings.ai, original, width, height, blocks: detection.blocks, usage })
      : { regions: [] as DetectedRegion[], sourceLanguage: undefined, model: settings.ai.reader.model, fallbackUsed: false };

  await checkpoint(hooks, "translating");
  const existing = image.layout ? pageLayoutSchema.safeParse(image.layout) : null;
  const existingLayout = existing?.success ? existing.data : null;
  const regions = mergeWithLocked(existingLayout, regionsFromReading(reading.regions, reading.sourceLanguage));
  const translated = await translateRegions({
    settings,
    context: { ...context, sourceLanguage: reading.sourceLanguage || context?.sourceLanguage },
    regions,
    usage,
  });

  const layout = createLayout(width, height, translated.regions, {
    source: "ai",
    detector: `ppocr-det+${reading.model}`,
    targetLanguage: settings.targetLanguage,
    createdAt: existingLayout?.meta.createdAt,
  });

  await checkpoint(hooks, "rendering");
  const render = await renderImage(image, layout, { apply: true, original });

  const result = combineUsage(usage, translated.model, reading.fallbackUsed);
  result.processing = {
    requestedPipeline: "ai",
    actualPipeline: "ai",
    detection: {
      provider: "ppocr-det",
      model: "ppocr-v4-det",
      durationMs: detection.durationMs,
      regions: reading.regions.length,
    },
    reading: {
      provider: providerName(settings.ai, reading.fallbackUsed && settings.ai.readerFallback ? settings.ai.readerFallback.providerId : settings.ai.reader.providerId),
      model: reading.model,
      fallbackUsed: reading.fallbackUsed,
    },
    translation: {
      provider: providerName(settings.ai, settings.ai.translator.providerId),
      model: translated.model,
      inputMode: "text",
      fallbackUsed: false,
    },
    completedAt: new Date().toISOString(),
  };
  const cost = calculateUsageCost(result);
  await db.update(images).set({ usage: result, cost, updatedAt: new Date() }).where(eq(images.id, image.id));
  return { render, usage: result, cost };
};
