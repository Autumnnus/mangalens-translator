import { db } from "@/db";
import { images } from "@/db/schema";
import { createLayout, createRegion } from "@/layout/defaults";
import { legacyBoxToPixels } from "@/layout/legacy";
import { PageLayout, pageLayoutSchema, Region, RegionKind } from "@/layout/types";
import { combineUsage, GeminiCallError } from "@/server/gemini/common";
import { detectTextBlocks, TextBlock } from "@/server/detect/textDetector";
import { DetectedRegion, detectRegions, ParsedDetection } from "@/server/gemini/detect";
import {
  buildNumberedOverlay,
  NumberedOverlay,
  readRegions,
} from "@/server/gemini/readRegions";
import { refineRegions } from "@/server/gemini/refine";
import { isRetryableGeminiError } from "@/server/gemini/keys";
import { runWithKeyPool } from "@/server/gemini/runWithKeys";
import {
  translateItems,
  TranslationContext,
  TranslationItem,
} from "@/server/gemini/translateText";
import {
  loadOriginal,
  OwnedImage,
  readDimensions,
  renderImage,
  RenderResult,
} from "@/server/pages/layoutService";
import {
  LocalOcrBubble,
  ProcessingMetadata,
  TranslationSettings,
  UsageBreakdown,
  UsageMetadata,
} from "@/types";
import { calculateGeminiCost } from "@/utils/cost";
import { eq } from "drizzle-orm";
import { ModelImage, prepareModelImage } from "./prepareImage";

/**
 * The page pipeline: detect -> translate -> render. Detection providers
 * (Gemini Vision, the local OCR worker) only produce regions with source
 * text; everything after that is shared and runs on the server.
 */

export interface PipelineSettings {
  targetLanguage: string;
  customInstructions?: string;
  model: string;
  fallbackModel: string;
  enableQualityFallback: boolean;
}

export const resolvePipelineSettings = (
  stored: Partial<TranslationSettings>,
  overrides: Partial<PipelineSettings> = {},
): PipelineSettings => ({
  targetLanguage:
    overrides.targetLanguage || stored.targetLanguage || "Turkish",
  customInstructions:
    overrides.customInstructions ?? stored.customInstructions ?? undefined,
  model: overrides.model || stored.model || "gemini-2.5-flash-lite",
  fallbackModel:
    overrides.fallbackModel || stored.fallbackModel || "gemini-2.5-flash",
  enableQualityFallback:
    overrides.enableQualityFallback ?? stored.enableQualityFallback ?? true,
});

export interface DetectorInfo {
  provider: ProcessingMetadata["detection"]["provider"];
  model: string;
  workerId?: string;
  device?: string;
  durationMs?: number;
  mangaOcrEnabled?: boolean;
  usageEntries?: UsageBreakdown[];
  fallbackUsed?: boolean;
}

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
  if (hooks?.shouldContinue && !(await hooks.shouldContinue())) {
    throw new PipelineCancelledError();
  }
  await hooks?.onStage?.(stage);
};

// ---------------------------------------------------------------------------
// Region construction

export const regionsFromDetection = (
  detected: DetectedRegion[],
  source: Region["source"],
): Region[] =>
  detected.map((item, index) =>
    createRegion({
      id: `${source === "ocr" ? "o" : "g"}_${index + 1}`,
      kind: item.kind,
      order: item.order ?? index,
      textBox: item.textBox,
      bubbleBox: item.bubbleBox,
      sourceText: item.sourceText,
      translatedText: "",
      source,
      confidence: item.confidence,
      textBoxPrecise: item.precise,
      sourceLineHeight: item.lineHeight,
    }),
  );

const KIND_BY_OCR_TYPE: Record<string, RegionKind> = {
  speech: "speech",
  dialogue: "speech",
  caption: "caption",
  sfx: "sfx",
  environmental: "sfx",
  label: "label",
};

export const detectedFromLocalOcr = (
  bubbles: LocalOcrBubble[],
  width: number,
  height: number,
): DetectedRegion[] =>
  bubbles.map((bubble, index) => ({
    kind: KIND_BY_OCR_TYPE[String(bubble.type)] || "speech",
    textBox: legacyBoxToPixels(bubble.box_2d, width, height),
    sourceText: bubble.original_text,
    confidence: bubble.confidence,
    order: index,
  }));

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
export const mergeWithLocked = (
  existing: PageLayout | null,
  detected: Region[],
): Region[] => {
  const locked = existing?.regions.filter((region) => region.locked) || [];
  if (locked.length === 0) return detected;
  const kept = detected.filter(
    (region) =>
      !locked.some((lockedRegion) => boxIou(lockedRegion.textBox, region.textBox) > 0.35),
  );
  return [...locked, ...kept].sort((a, b) => a.order - b.order);
};

// ---------------------------------------------------------------------------
// Translation stage

export const translateRegions = async ({
  userId,
  keys,
  settings,
  context,
  regions,
  usageEntries,
}: {
  userId: string;
  keys: string[];
  settings: PipelineSettings;
  context?: TranslationContext;
  regions: Region[];
  usageEntries: UsageBreakdown[];
}): Promise<{ regions: Region[]; modelUsed: string; fallbackUsed: boolean }> => {
  const items: TranslationItem[] = regions
    .filter((region) => !region.locked && region.sourceText.trim())
    .map((region) => ({
      id: region.id,
      kind: region.kind,
      text: region.sourceText,
    }));
  if (items.length === 0) {
    return { regions, modelUsed: settings.model, fallbackUsed: false };
  }

  const attempt = (modelName: string) =>
    runWithKeyPool({
      userId,
      keys,
      modelName,
      usageEntries,
      run: async (apiKey) => {
        const result = await translateItems({
          apiKey,
          modelName,
          targetLanguage: settings.targetLanguage,
          customInstructions: settings.customInstructions,
          context,
          items,
        });
        return { value: result.translations, usage: result.usage };
      },
    });

  let translations: Map<string, string>;
  let modelUsed = settings.model;
  let fallbackUsed = false;
  try {
    translations = await attempt(settings.model);
  } catch (error) {
    const canFallback =
      settings.enableQualityFallback &&
      settings.fallbackModel !== settings.model &&
      !isRetryableGeminiError(error);
    if (!canFallback) throw error;
    translations = await attempt(settings.fallbackModel);
    modelUsed = settings.fallbackModel;
    fallbackUsed = true;
  }

  return {
    regions: regions.map((region) =>
      translations.has(region.id)
        ? { ...region, translatedText: translations.get(region.id)! }
        : region,
    ),
    modelUsed,
    fallbackUsed,
  };
};

// ---------------------------------------------------------------------------
// Completion shared by every detection provider

export const completeDetectedPage = async ({
  image,
  userId,
  keys,
  settings,
  requestedPipeline,
  detected,
  detector,
  context,
  original,
  sourceLanguage,
  hooks,
}: {
  image: OwnedImage;
  userId: string;
  keys: string[];
  settings: PipelineSettings;
  requestedPipeline: ProcessingMetadata["requestedPipeline"];
  detected: DetectedRegion[];
  detector: DetectorInfo;
  context?: TranslationContext;
  original?: Buffer;
  sourceLanguage?: string;
  hooks?: PipelineHooks;
}): Promise<CompletedPage> => {
  await checkpoint(hooks, "translating");
  const bytes = original || (await loadOriginal(image));
  const { width, height } = await readDimensions(bytes);
  const existing = image.layout
    ? pageLayoutSchema.safeParse(image.layout)
    : null;
  const existingLayout = existing?.success ? existing.data : null;

  const source: Region["source"] =
    detector.provider === "paddleocr" ? "ocr" : "gemini";
  const usageEntries: UsageBreakdown[] = [...(detector.usageEntries || [])];
  const merged = mergeWithLocked(
    existingLayout,
    regionsFromDetection(detected, source),
  );
  const translated = await translateRegions({
    userId,
    keys,
    settings,
    context: { ...context, sourceLanguage: sourceLanguage || context?.sourceLanguage },
    regions: merged,
    usageEntries,
  });

  const layout = createLayout(width, height, translated.regions, {
    source,
    detector: `${detector.provider}:${detector.model}`,
    targetLanguage: settings.targetLanguage,
    createdAt: existingLayout?.meta.createdAt,
  });

  await checkpoint(hooks, "rendering");
  const render = await renderImage(image, layout, { apply: true, original: bytes });

  const fallbackUsed = !!detector.fallbackUsed || translated.fallbackUsed;
  const usage = combineUsage(usageEntries, translated.modelUsed, fallbackUsed);
  usage.processing = {
    requestedPipeline,
    actualPipeline: detector.provider === "paddleocr" ? "local_ocr" : "gemini_vision",
    detection: {
      provider: detector.provider,
      model: detector.model,
      workerId: detector.workerId,
      device: detector.device,
      durationMs: detector.durationMs,
      regions: detected.length,
      mangaOcrEnabled: detector.mangaOcrEnabled,
    },
    translation: {
      provider: "gemini",
      model: translated.modelUsed,
      inputMode: "text",
      fallbackUsed: translated.fallbackUsed,
    },
    completedAt: new Date().toISOString(),
  };
  const cost = calculateGeminiCost(usage, settings.model);
  await db
    .update(images)
    .set({ usage, cost, updatedAt: new Date() })
    .where(eq(images.id, image.id));

  return { render, usage, cost };
};

// ---------------------------------------------------------------------------
// Gemini Vision detection

export const detectWithGemini = async ({
  userId,
  keys,
  settings,
  modelImage,
  usageEntries,
}: {
  userId: string;
  keys: string[];
  settings: PipelineSettings;
  modelImage: ModelImage;
  usageEntries: UsageBreakdown[];
}): Promise<{ parsed: ParsedDetection; modelUsed: string; fallbackUsed: boolean }> => {
  const attempt = (modelName: string) =>
    runWithKeyPool({
      userId,
      keys,
      modelName,
      usageEntries,
      run: async (apiKey) => {
        const result = await detectRegions({
          apiKey,
          modelName,
          base64Image: modelImage.base64,
          mimeType: modelImage.mimeType,
          width: modelImage.width,
          height: modelImage.height,
        });
        return { value: result.parsed, usage: result.usage };
      },
    });

  const fallbackAllowed =
    settings.enableQualityFallback && settings.fallbackModel !== settings.model;

  let parsed: ParsedDetection;
  try {
    parsed = await attempt(settings.model);
  } catch (primaryError) {
    if (!fallbackAllowed || isRetryableGeminiError(primaryError)) {
      throw primaryError;
    }
    // A safety block on the primary is very likely to repeat; let the caller
    // route it to the local worker instead of paying for a second image call.
    if ((primaryError as GeminiCallError).isSafetyBlocked) throw primaryError;
    return {
      parsed: await attempt(settings.fallbackModel),
      modelUsed: settings.fallbackModel,
      fallbackUsed: true,
    };
  }

  if (fallbackAllowed && parsed.shouldFallback) {
    try {
      const better = await attempt(settings.fallbackModel);
      if (better.regions.length > 0 || parsed.regions.length === 0) {
        return { parsed: better, modelUsed: settings.fallbackModel, fallbackUsed: true };
      }
    } catch (error) {
      console.warn("Detection fallback failed; keeping primary result", error);
    }
  }
  return { parsed, modelUsed: settings.model, fallbackUsed: false };
};

/**
 * Second pass over the detector's boxes: one call with a zoomed crop per
 * region. Failures here are not fatal; the page continues with the coarse
 * boxes and the pixel-level snapping.
 */
export const refineDetectedRegions = async ({
  userId,
  keys,
  modelName,
  original,
  width,
  height,
  regions,
  usageEntries,
}: {
  userId: string;
  keys: string[];
  modelName: string;
  original: Buffer;
  width: number;
  height: number;
  regions: DetectedRegion[];
  usageEntries: UsageBreakdown[];
}): Promise<DetectedRegion[]> => {
  if (regions.length === 0) return regions;
  try {
    return await runWithKeyPool({
      userId,
      keys,
      modelName,
      usageEntries,
      run: async (apiKey) => {
        const result = await refineRegions({ apiKey, modelName, original, width, height, regions });
        return { value: result.regions, usage: result.usage };
      },
    });
  } catch (error) {
    console.warn("Box refinement failed; using detector boxes", error);
    return regions;
  }
};

export interface DetectionOutcome {
  regions: DetectedRegion[];
  modelUsed: string;
  fallbackUsed: boolean;
  /** How the boxes were obtained. */
  detector: "ppocr+gemini" | "gemini";
  sourceLanguage?: string;
  blocks?: TextBlock[];
  overlay?: NumberedOverlay;
}

/**
 * Detection for a page. Preferred path: the local text detector finds every
 * line, Gemini reads the numbered boxes. If the detector finds nothing (or is
 * unavailable) the model's own full-page boxes are used, refined by crops.
 */
export const detectPage = async ({
  userId,
  keys,
  settings,
  original,
  width,
  height,
  usageEntries,
}: {
  userId: string;
  keys: string[];
  settings: PipelineSettings;
  original: Buffer;
  width: number;
  height: number;
  usageEntries: UsageBreakdown[];
}): Promise<DetectionOutcome> => {
  let blocks: TextBlock[] = [];
  try {
    blocks = (await detectTextBlocks(original)).blocks;
  } catch (error) {
    console.warn("Text detector failed; falling back to model boxes", error);
  }

  if (blocks.length > 0) {
    const overlay = await buildNumberedOverlay(original, width, height, blocks);
    const attempt = (modelName: string) =>
      runWithKeyPool({
        userId,
        keys,
        modelName,
        usageEntries,
        run: async (apiKey) => {
          const result = await readRegions({ apiKey, modelName, overlay, blocks });
          return { value: result.result, usage: result.usage };
        },
      });
    const fallbackAllowed =
      settings.enableQualityFallback && settings.fallbackModel !== settings.model;
    try {
      const read = await attempt(settings.model);
      return {
        regions: read.regions,
        modelUsed: settings.model,
        fallbackUsed: false,
        detector: "ppocr+gemini",
        sourceLanguage: read.sourceLanguage,
        blocks,
        overlay,
      };
    } catch (error) {
      if (!fallbackAllowed || isRetryableGeminiError(error) || (error as GeminiCallError).isSafetyBlocked) {
        throw error;
      }
      const read = await attempt(settings.fallbackModel);
      return {
        regions: read.regions,
        modelUsed: settings.fallbackModel,
        fallbackUsed: true,
        detector: "ppocr+gemini",
        sourceLanguage: read.sourceLanguage,
        blocks,
        overlay,
      };
    }
  }

  const modelImage = await prepareModelImage(original);
  const detection = await detectWithGemini({ userId, keys, settings, modelImage, usageEntries });
  const refined = await refineDetectedRegions({
    userId,
    keys,
    modelName: detection.modelUsed,
    original,
    width,
    height,
    regions: detection.parsed.regions,
    usageEntries,
  });
  return {
    regions: refined,
    modelUsed: detection.modelUsed,
    fallbackUsed: detection.fallbackUsed,
    detector: "gemini",
    sourceLanguage: detection.parsed.sourceLanguage,
  };
};

export const translatePageWithGemini = async ({
  image,
  userId,
  keys,
  settings,
  requestedPipeline,
  context,
  hooks,
}: {
  image: OwnedImage;
  userId: string;
  keys: string[];
  settings: PipelineSettings;
  requestedPipeline: ProcessingMetadata["requestedPipeline"];
  context?: TranslationContext;
  hooks?: PipelineHooks;
}): Promise<CompletedPage> => {
  await checkpoint(hooks, "detecting");
  const original = await loadOriginal(image);
  const { width, height } = await readDimensions(original);
  const usageEntries: UsageBreakdown[] = [];
  const detection = await detectPage({
    userId,
    keys,
    settings,
    original,
    width,
    height,
    usageEntries,
  });
  return completeDetectedPage({
    image,
    userId,
    keys,
    settings,
    requestedPipeline,
    detected: detection.regions,
    detector: {
      provider: "gemini",
      model: `${detection.detector === "ppocr+gemini" ? "ppocr-det+" : ""}${detection.modelUsed}`,
      usageEntries,
      fallbackUsed: detection.fallbackUsed,
    },
    context,
    original,
    sourceLanguage: detection.sourceLanguage,
    hooks,
  });
};
