import { GoogleGenAI, Type } from "@google/genai";
import { Box, RegionKind, REGION_KINDS } from "@/layout/types";
import { TextBlock } from "@/server/detect/textDetector";
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
 * Stage 1 (detector-assisted): the page is sent with numbered boxes drawn on
 * it and Gemini transcribes and classifies each number. Coordinates come from
 * the detector, never from the model.
 */

export interface NumberedOverlay {
  base64: string;
  mimeType: "image/jpeg";
  width: number;
  height: number;
}

const OVERLAY_MAX_EDGE = 1568;
const OVERLAY_MIN_EDGE = 1400;

const isKind = (value: unknown): value is RegionKind =>
  typeof value === "string" && (REGION_KINDS as readonly string[]).includes(value);

/** Draws numbered boxes on an upscaled copy of the page. */
export const buildNumberedOverlay = async (
  original: Buffer,
  width: number,
  height: number,
  blocks: TextBlock[],
): Promise<NumberedOverlay> => {
  const longEdge = Math.max(width, height);
  const target = longEdge < OVERLAY_MIN_EDGE ? OVERLAY_MIN_EDGE : Math.min(longEdge, OVERLAY_MAX_EDGE);
  const scale = target / longEdge;
  const outW = Math.round(width * scale);
  const outH = Math.round(height * scale);
  const stroke = Math.max(2, Math.round(outW / 500));
  const fontSize = Math.max(14, Math.round(outW / 45));
  const shapes = blocks
    .map((block, index) => {
      const x = block.box.x * scale;
      const y = block.box.y * scale;
      const w = block.box.w * scale;
      const h = block.box.h * scale;
      const label = String(index + 1);
      const badgeW = fontSize * (0.65 * label.length + 0.5);
      const badgeH = fontSize * 1.2;
      const badgeX = clamp(x - stroke, 0, outW - badgeW);
      const badgeY = clamp(y - badgeH - stroke, 0, outH - badgeH);
      return [
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#ff2020" stroke-width="${stroke}"/>`,
        `<rect x="${badgeX}" y="${badgeY}" width="${badgeW}" height="${badgeH}" fill="#ff2020"/>`,
        `<text x="${badgeX + badgeW / 2}" y="${badgeY + badgeH * 0.78}" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${fontSize}" fill="#ffffff" text-anchor="middle">${label}</text>`,
      ].join("");
    })
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${outW}" height="${outH}">${shapes}</svg>`;
  const image = await sharp(original, { limitInputPixels: 120_000_000 })
    .rotate()
    .resize(outW, outH, { fit: "fill", kernel: "lanczos3" })
    .flatten({ background: "#ffffff" })
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
  return { base64: image.toString("base64"), mimeType: "image/jpeg", width: outW, height: outH };
};

export const buildReadPrompt = (count: number) =>
  [
    `This comic page has ${count} numbered red boxes marking detected text regions. Each number sits just above its box.`,
    "For every box number return:",
    "- index: the box number.",
    "- is_text: false if the box does not contain readable lettering (artwork, a stray mark). Otherwise true.",
    '- kind: "speech" for spoken balloons, "thought" for cloud or dashed balloons, "caption" for narration boxes, "sfx" for onomatopoeia drawn as artwork, "label" for signs, screens and small labels.',
    "- text: the exact text inside the box, lines joined with single spaces, punctuation kept. Read vertical Japanese top-to-bottom, right-to-left. Do not translate.",
    "- same_balloon_as: only when this box and another numbered box lie inside the very same balloon outline (the detector split one balloon's lines), give that box's number. A sentence that continues in a different balloon is NOT the same balloon; leave it out.",
    "- confidence: 0-100.",
    "Return the items in the natural reading order of the page (right-to-left, top-to-bottom for manga).",
    'Also report has_text, page_confidence (0-100) and source_language as a BCP-47 tag such as "ja", "en" or "ko".',
  ].join("\n");

export const READ_RESPONSE_SCHEMA = {
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
          index: { type: Type.INTEGER },
          is_text: { type: Type.BOOLEAN },
          kind: { type: Type.STRING, enum: [...REGION_KINDS] },
          text: { type: Type.STRING },
          same_balloon_as: { type: Type.INTEGER },
          confidence: { type: Type.INTEGER },
        },
        required: ["index", "is_text", "kind", "text", "confidence"],
      },
    },
  },
  required: ["has_text", "page_confidence", "items"],
};

export const buildReadConfig = (modelName: string) => ({
  responseMimeType: "application/json",
  responseSchema: READ_RESPONSE_SCHEMA,
  temperature: 0.1,
  topP: 0.9,
  maxOutputTokens: 8192,
  thinkingConfig: thinkingConfigFor(modelName),
  safetySettings: SAFETY_SETTINGS,
});

export interface ReadResult {
  regions: DetectedRegion[];
  hasText: boolean;
  pageConfidence: number;
  sourceLanguage?: string;
}

const unionBox = (a: Box, b: Box): Box => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y,
  };
};

/**
 * Geometry guard for merges: two blocks can only share a balloon when they are
 * stacked closely and overlap horizontally. This stops the model from fusing a
 * sentence that continues in a neighbouring balloon.
 */
const blocksAdjacent = (a: TextBlock, b: TextBlock) => {
  const lineHeight = Math.min(
    ...[...a.lines, ...b.lines].map((line) => line.box.h),
  );
  const overlapX =
    Math.max(0, Math.min(a.box.x + a.box.w, b.box.x + b.box.w) - Math.max(a.box.x, b.box.x)) /
    Math.max(1, Math.min(a.box.w, b.box.w));
  const gapY = Math.max(0, Math.max(a.box.y, b.box.y) - Math.min(a.box.y + a.box.h, b.box.y + b.box.h));
  return overlapX >= 0.3 && gapY <= lineHeight * 1.6;
};

/** Turns the model's per-box answers into regions with the detector's boxes. */
export const parseReadResponse = (text: string, blocks: TextBlock[]): ReadResult => {
  type RawItem = {
    index?: unknown;
    is_text?: unknown;
    kind?: unknown;
    text?: unknown;
    same_balloon_as?: unknown;
    confidence?: unknown;
  };
  const decoded = JSON.parse(text) as {
    has_text?: unknown;
    page_confidence?: unknown;
    source_language?: unknown;
    items?: RawItem[];
  };
  const items = Array.isArray(decoded.items) ? decoded.items : [];

  type Draft = { indices: number[]; kind: RegionKind; texts: Map<number, string>; confidence: number; order: number };
  const drafts = new Map<number, Draft>(); // keyed by root index
  const rootOf = new Map<number, number>();
  const resolveRoot = (index: number): number => {
    let current = index;
    const seen = new Set<number>();
    while (rootOf.has(current) && !seen.has(current)) {
      seen.add(current);
      current = rootOf.get(current)!;
    }
    return current;
  };

  items.forEach((item, position) => {
    const index = Number(item?.index);
    if (!Number.isInteger(index) || index < 1 || index > blocks.length) return;
    if (item?.is_text === false) return;
    const textValue = String(item?.text || "").replace(/\s+/g, " ").trim();
    if (!textValue) return;
    const merge = Number(item?.same_balloon_as);
    if (
      Number.isInteger(merge) &&
      merge >= 1 &&
      merge <= blocks.length &&
      merge !== index &&
      blocksAdjacent(blocks[index - 1], blocks[merge - 1])
    ) {
      rootOf.set(index, merge);
    }
    const root = resolveRoot(index);
    const draft = drafts.get(root) || {
      indices: [],
      kind: isKind(item?.kind) ? item.kind : "speech",
      texts: new Map<number, string>(),
      confidence: normalizeConfidence(item?.confidence),
      order: position,
    };
    draft.indices.push(index);
    draft.texts.set(index, textValue);
    draft.confidence = Math.min(draft.confidence, normalizeConfidence(item?.confidence));
    drafts.set(root, draft);
  });

  // A merge target may have been listed after its parts; fold drafts whose
  // root got remapped.
  const regions: DetectedRegion[] = [];
  const consumed = new Set<number>();
  const sortedDrafts = [...drafts.entries()].sort((a, b) => a[1].order - b[1].order);
  for (const [root, draft] of sortedDrafts) {
    if (consumed.has(root)) continue;
    const indices = [...new Set(draft.indices)];
    let box: Box | null = null;
    for (const index of indices) {
      box = box ? unionBox(box, blocks[index - 1].box) : blocks[index - 1].box;
      consumed.add(index);
    }
    if (!box) continue;
    const orderedIndices = [...indices].sort((a, b) => blocks[a - 1].box.y - blocks[b - 1].box.y);
    const lineHeights = indices
      .flatMap((index) => blocks[index - 1].lines.map((line) => line.box.h))
      .sort((a, b) => a - b);
    regions.push({
      kind: draft.kind,
      textBox: box,
      sourceText: orderedIndices.map((index) => draft.texts.get(index) || "").filter(Boolean).join(" "),
      confidence: draft.confidence,
      order: regions.length,
      precise: true,
      lineHeight: lineHeights[Math.floor(lineHeights.length / 2)],
    });
  }

  const sourceLanguage =
    typeof decoded.source_language === "string" && decoded.source_language.trim()
      ? decoded.source_language.trim().slice(0, 16)
      : undefined;
  return {
    regions,
    hasText: decoded.has_text === true || regions.length > 0,
    pageConfidence: normalizeConfidence(decoded.page_confidence),
    sourceLanguage,
  };
};

export const readRegions = async ({
  apiKey,
  modelName,
  overlay,
  blocks,
  billingMode = "standard",
}: {
  apiKey: string;
  modelName: string;
  overlay: NumberedOverlay;
  blocks: TextBlock[];
  billingMode?: UsageBreakdown["billingMode"];
}): Promise<{ result: ReadResult; usage: UsageBreakdown }> => {
  const client = new GoogleGenAI({ apiKey });
  const response = await client.models.generateContent({
    model: modelName,
    contents: {
      parts: [
        { text: buildReadPrompt(blocks.length) },
        { inlineData: { mimeType: overlay.mimeType, data: overlay.base64 } },
      ],
    },
    config: buildReadConfig(modelName),
  });
  const usage = usageFromResponse(response, modelName, billingMode);
  try {
    if (!response.text) throw new Error("Gemini returned an empty reading response");
    return { result: parseReadResponse(response.text, blocks), usage };
  } catch (error) {
    throw toGeminiCallError(error, response, usage, "Gemini reading response could not be parsed");
  }
};
