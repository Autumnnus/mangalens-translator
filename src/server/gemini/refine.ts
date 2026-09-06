import { GoogleGenAI, Type } from "@google/genai";
import { Box } from "@/layout/types";
import { UsageBreakdown } from "@/types";
import sharp from "sharp";
import {
  clamp,
  normalizeConfidence,
  SAFETY_SETTINGS,
  thinkingConfigFor,
  toGeminiCallError,
  usageFromResponse,
} from "./common";
import { DetectedRegion } from "./detect";

/**
 * Stage 1b: box refinement. Full-page boxes from the model drift by a good
 * fraction of the page on real scans. Each region is cropped generously,
 * upscaled and sent back in one call with its transcription; inside a crop
 * the text is large and the model localises it precisely.
 */

export interface RefinedRegion extends DetectedRegion {
  /** true when the crop pass confirmed and re-located the text. */
  refined: boolean;
}

const CROP_MAX_EDGE = 640;

const cropWindow = (box: Box, width: number, height: number, factor: number): Box => {
  const minSide = Math.min(width, height) * 0.28;
  const w = clamp(Math.max(box.w * factor, minSide), 32, width);
  const h = clamp(Math.max(box.h * factor, minSide), 32, height);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  return {
    x: clamp(cx - w / 2, 0, width - w),
    y: clamp(cy - h / 2, 0, height - h),
    w,
    h,
  };
};

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          crop: { type: Type.INTEGER },
          found: { type: Type.BOOLEAN },
          box_2d: { type: Type.ARRAY, items: { type: Type.INTEGER } },
          bubble_2d: { type: Type.ARRAY, items: { type: Type.INTEGER } },
          confidence: { type: Type.INTEGER },
        },
        required: ["crop", "found", "confidence"],
      },
    },
  },
  required: ["items"],
};

const boxFromNormalized = (value: unknown, window: Box): Box | null => {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const values = value.map(Number);
  if (values.some((v) => !Number.isFinite(v))) return null;
  const [y1, x1, y2, x2] = values;
  const ymin = clamp(Math.min(y1, y2), 0, 1000);
  const xmin = clamp(Math.min(x1, x2), 0, 1000);
  const ymax = clamp(Math.max(y1, y2), 0, 1000);
  const xmax = clamp(Math.max(x1, x2), 0, 1000);
  if (ymax - ymin < 5 || xmax - xmin < 5) return null;
  return {
    x: window.x + (xmin / 1000) * window.w,
    y: window.y + (ymin / 1000) * window.h,
    w: ((xmax - xmin) / 1000) * window.w,
    h: ((ymax - ymin) / 1000) * window.h,
  };
};

export const refineRegions = async ({
  apiKey,
  modelName,
  original,
  width,
  height,
  regions,
  factor = 3,
}: {
  apiKey: string;
  modelName: string;
  original: Buffer;
  width: number;
  height: number;
  regions: DetectedRegion[];
  /** Crop size relative to the detector's box. */
  factor?: number;
}): Promise<{ regions: RefinedRegion[]; usage: UsageBreakdown }> => {
  const empty: UsageBreakdown = {
    model: modelName,
    billingMode: "standard",
    promptTokenCount: 0,
    candidatesTokenCount: 0,
    thoughtsTokenCount: 0,
    totalTokenCount: 0,
  };
  const targets = regions.filter((region) => region.kind !== "sfx");
  if (targets.length === 0) {
    return { regions: regions.map((region) => ({ ...region, refined: false })), usage: empty };
  }

  const source = sharp(original, { limitInputPixels: 120_000_000 }).rotate();
  const windows: Box[] = [];
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
  for (const [index, region] of targets.entries()) {
    const window = cropWindow(region.textBox, width, height, factor);
    windows.push(window);
    const crop = await source
      .clone()
      .extract({
        left: Math.round(window.x),
        top: Math.round(window.y),
        width: Math.max(1, Math.round(window.w)),
        height: Math.max(1, Math.round(window.h)),
      })
      .resize({ width: CROP_MAX_EDGE, height: CROP_MAX_EDGE, fit: "inside" })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 90 })
      .toBuffer();
    parts.push({ text: `Crop ${index + 1}. Expected text: ${JSON.stringify(region.sourceText)}` });
    parts.push({ inlineData: { mimeType: "image/jpeg", data: crop.toString("base64") } });
  }

  const prompt = [
    `You receive ${targets.length} crops from one comic page. Each crop is preceded by the text it should contain.`,
    "For every crop return:",
    "- crop: the crop number.",
    "- found: whether that exact text (or most of it) is visible in the crop.",
    "- box_2d: a tight box around those text glyphs only, [ymin, xmin, ymax, xmax] normalized to 0-1000 of the crop. Omit when not found.",
    "- bubble_2d: the bounds of the balloon or box containing the text, if any, in the same coordinates.",
    "- confidence: 0-100.",
    "Be precise: the box must hug the lettering, not the balloon, and must not include other balloons' text.",
  ].join("\n");

  const client = new GoogleGenAI({ apiKey });
  const response = await client.models.generateContent({
    model: modelName,
    contents: { parts: [{ text: prompt }, ...parts] },
    config: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.1,
      maxOutputTokens: 4096,
      thinkingConfig: thinkingConfigFor(modelName),
      safetySettings: SAFETY_SETTINGS,
    },
  });
  const usage = usageFromResponse(response, modelName, "standard");
  try {
    if (!response.text) throw new Error("Gemini returned an empty refinement response");
    type RawItem = { crop?: unknown; found?: unknown; box_2d?: unknown; bubble_2d?: unknown; confidence?: unknown };
    const decoded = JSON.parse(response.text) as { items?: RawItem[] };
    const byCrop = new Map<number, RawItem>();
    for (const item of decoded.items || []) {
      const index = Number(item?.crop);
      if (Number.isFinite(index)) byCrop.set(index, item);
    }
    const refinedById = new Map<DetectedRegion, RefinedRegion>();
    targets.forEach((region, index) => {
      const item = byCrop.get(index + 1);
      const window = windows[index];
      const textBox = item?.found === true ? boxFromNormalized(item.box_2d, window) : null;
      if (!textBox) {
        refinedById.set(region, { ...region, refined: false });
        return;
      }
      refinedById.set(region, {
        ...region,
        textBox,
        bubbleBox: boxFromNormalized(item?.bubble_2d, window) || region.bubbleBox,
        confidence: Math.min(region.confidence, normalizeConfidence(item?.confidence)),
        refined: true,
      });
    });
    return {
      regions: regions.map((region) => refinedById.get(region) || { ...region, refined: false }),
      usage,
    };
  } catch (error) {
    throw toGeminiCallError(error, response, usage, "Box refinement failed");
  }
};
