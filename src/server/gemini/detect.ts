import {
  GenerateContentConfig,
  GoogleGenAI,
  Type,
} from "@google/genai";
import { Box, RegionKind, REGION_KINDS } from "@/layout/types";
import { UsageBreakdown } from "@/types";
import {
  clamp,
  normalizeConfidence,
  SAFETY_SETTINGS,
  thinkingConfigFor,
  toGeminiCallError,
  usageFromResponse,
} from "./common";

/**
 * Stage 1: detection and transcription. The model only locates text and
 * reads it; translation is a separate, text-only stage so it can be re-run,
 * given page context, and shared with the local OCR path.
 */

export interface DetectedRegion {
  kind: RegionKind;
  /** Pixels in the original image. */
  textBox: Box;
  bubbleBox?: Box;
  sourceText: string;
  confidence: number;
  order: number;
}

export interface ParsedDetection {
  regions: DetectedRegion[];
  hasText: boolean;
  pageConfidence: number;
  sourceLanguage?: string;
  /** Detection looked unreliable enough to justify a second, better model. */
  shouldFallback: boolean;
}

export interface DetectionAttempt {
  parsed: ParsedDetection;
  usage: UsageBreakdown;
}

export const buildDetectionPrompt = () =>
  [
    "You are a manga and comic text detector. Locate every piece of readable text on this page and transcribe it exactly as written. Do not translate.",
    "For each item return:",
    "- box_2d: a tight box around the text glyphs only, as [ymin, xmin, ymax, xmax] normalized to 0-1000.",
    "- bubble_2d: the bounds of the balloon, thought cloud or caption box that contains the text, when there is one. Omit it for sound effects and free-floating text.",
    '- kind: "speech" for spoken balloons, "thought" for cloud or dashed balloons, "caption" for narration boxes, "sfx" for onomatopoeia drawn as artwork, "label" for signs, screens and small labels.',
    "- text: the source text, lines joined with single spaces, punctuation kept. Read vertical Japanese top-to-bottom and right-to-left.",
    "- confidence: 0-100.",
    "One item per balloon; never split one balloon into several items and never merge different balloons.",
    "Return items in the natural reading order of the page (right-to-left, top-to-bottom for manga).",
    "Ignore page numbers, watermarks, publisher marks and text that is part of a drawing's texture.",
    'Also report has_text, page_confidence (0-100) and source_language as a BCP-47 tag such as "ja", "en" or "ko".',
  ].join("\n");

export const DETECTION_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    has_text: { type: Type.BOOLEAN },
    page_confidence: { type: Type.INTEGER },
    source_language: { type: Type.STRING },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          box_2d: { type: Type.ARRAY, items: { type: Type.INTEGER } },
          bubble_2d: { type: Type.ARRAY, items: { type: Type.INTEGER } },
          kind: { type: Type.STRING, enum: [...REGION_KINDS] },
          text: { type: Type.STRING },
          confidence: { type: Type.INTEGER },
        },
        required: ["box_2d", "kind", "text", "confidence"],
      },
    },
  },
  required: ["has_text", "page_confidence", "items"],
};

export const buildDetectionConfig = (
  modelName: string,
): GenerateContentConfig => ({
  responseMimeType: "application/json",
  responseSchema: DETECTION_RESPONSE_SCHEMA,
  temperature: 0.1,
  topP: 0.9,
  maxOutputTokens: 8192,
  thinkingConfig: thinkingConfigFor(modelName),
  safetySettings: SAFETY_SETTINGS,
});

type RawItem = {
  box_2d?: unknown;
  bubble_2d?: unknown;
  kind?: unknown;
  text?: unknown;
  confidence?: unknown;
};

type RawDetection = {
  has_text?: unknown;
  page_confidence?: unknown;
  source_language?: unknown;
  items?: unknown;
};

const normalizedBoxToPixels = (
  value: unknown,
  width: number,
  height: number,
): Box | null => {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const values = value.map(Number);
  if (values.some((item) => !Number.isFinite(item))) return null;
  const [rawY1, rawX1, rawY2, rawX2] = values;
  const ymin = clamp(Math.min(rawY1, rawY2), 0, 1000);
  const xmin = clamp(Math.min(rawX1, rawX2), 0, 1000);
  const ymax = clamp(Math.max(rawY1, rawY2), 0, 1000);
  const xmax = clamp(Math.max(rawX1, rawX2), 0, 1000);
  if (ymax - ymin < 3 || xmax - xmin < 3) return null;
  return {
    x: (xmin / 1000) * width,
    y: (ymin / 1000) * height,
    w: ((xmax - xmin) / 1000) * width,
    h: ((ymax - ymin) / 1000) * height,
  };
};

const boxIou = (a: Box, b: Box) => {
  const iw = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const ih = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const intersection = iw * ih;
  return intersection / Math.max(1, a.w * a.h + b.w * b.h - intersection);
};

const isKind = (value: unknown): value is RegionKind =>
  typeof value === "string" &&
  (REGION_KINDS as readonly string[]).includes(value);

export const parseDetectionResponse = (
  text: string,
  width: number,
  height: number,
): ParsedDetection => {
  const decoded = JSON.parse(text) as RawDetection;
  const rawItems = Array.isArray(decoded.items) ? decoded.items : [];
  const regions: DetectedRegion[] = [];

  for (const raw of rawItems as RawItem[]) {
    if (!raw || typeof raw !== "object") continue;
    const textBox = normalizedBoxToPixels(raw.box_2d, width, height);
    const sourceText = String(raw.text || "").replace(/\s+/g, " ").trim();
    if (!textBox || !sourceText) continue;
    const candidate: DetectedRegion = {
      kind: isKind(raw.kind) ? raw.kind : "speech",
      textBox,
      bubbleBox: normalizedBoxToPixels(raw.bubble_2d, width, height) || undefined,
      sourceText,
      confidence: normalizeConfidence(raw.confidence),
      order: regions.length,
    };
    // Drop duplicates the model sometimes emits for the same balloon.
    const duplicate = regions.findIndex(
      (existing) =>
        boxIou(existing.textBox, candidate.textBox) >= 0.8 &&
        existing.sourceText.replace(/\s/g, "") ===
          candidate.sourceText.replace(/\s/g, ""),
    );
    if (duplicate === -1) {
      regions.push(candidate);
    } else if (candidate.confidence > regions[duplicate].confidence) {
      regions[duplicate] = { ...candidate, order: regions[duplicate].order };
    }
  }

  const hasText = decoded.has_text === true || regions.length > 0;
  const pageConfidence = normalizeConfidence(decoded.page_confidence);
  const sourceLanguage =
    typeof decoded.source_language === "string" &&
    decoded.source_language.trim()
      ? decoded.source_language.trim().slice(0, 16)
      : undefined;

  return {
    regions,
    hasText,
    pageConfidence,
    sourceLanguage,
    shouldFallback:
      (decoded.has_text === true && regions.length === 0) ||
      pageConfidence < 0.4,
  };
};

export const detectRegions = async ({
  apiKey,
  modelName,
  base64Image,
  mimeType,
  width,
  height,
  prompt = buildDetectionPrompt(),
  billingMode = "standard",
}: {
  apiKey: string;
  modelName: string;
  base64Image: string;
  mimeType: string;
  /** Original image dimensions; boxes are returned in that pixel space. */
  width: number;
  height: number;
  prompt?: string;
  billingMode?: UsageBreakdown["billingMode"];
}): Promise<DetectionAttempt> => {
  const client = new GoogleGenAI({ apiKey });
  const response = await client.models.generateContent({
    model: modelName,
    contents: {
      parts: [{ text: prompt }, { inlineData: { mimeType, data: base64Image } }],
    },
    config: buildDetectionConfig(modelName),
  });
  const usage = usageFromResponse(response, modelName, billingMode);
  try {
    if (!response.text) throw new Error("Gemini returned an empty detection response");
    return { parsed: parseDetectionResponse(response.text, width, height), usage };
  } catch (error) {
    throw toGeminiCallError(
      error,
      response,
      usage,
      "Gemini detection response could not be parsed",
    );
  }
};
