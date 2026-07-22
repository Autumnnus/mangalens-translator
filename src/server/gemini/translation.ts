import {
  GenerateContentConfig,
  GenerateContentResponse,
  GoogleGenAI,
  HarmBlockThreshold,
  HarmCategory,
  ThinkingLevel,
  Type,
} from "@google/genai";
import { TextBubble, UsageBreakdown, UsageMetadata } from "@/types";

type RawBubble = {
  box_2d?: unknown;
  original_text?: unknown;
  translated_text?: unknown;
  type?: unknown;
  confidence?: unknown;
};

type RawTranslationResponse = {
  page_confidence?: unknown;
  has_text?: unknown;
  bubbles?: unknown;
};

export type ParsedTranslation = {
  bubbles: TextBubble[];
  pageConfidence: number;
  hasText: boolean;
  shouldFallback: boolean;
};

export type TranslationAttempt = {
  parsed: ParsedTranslation;
  usage: UsageBreakdown;
};

export type TranslationAttemptError = Error & {
  usage?: UsageBreakdown;
};

const BUBBLE_TYPES = ["speech", "caption", "sfx", "label"] as const;

export const buildTranslationPrompt = (
  targetLanguage: string,
  customInstructions?: string,
) => {
  const custom = customInstructions?.trim();

  return [
    `Translate every visible comic text into ${targetLanguage}.`,
    "Use the complete page for context and preserve tone, names, honorifics, emotion, and meaning.",
    "Return items in natural reading order. Do not invent text.",
    "For speech/caption return the inner usable text area of its container; for sfx/label return a tight text box.",
    'Classify each item as "speech", "caption", "sfx", or "label".',
    "Coordinates are [ymin,xmin,ymax,xmax] normalized to 0-1000.",
    "Confidence values are integers from 0 to 100.",
    custom ? `Additional rules:\n${custom}` : "",
  ]
    .filter(Boolean)
    .join("\n");
};

export const TRANSLATION_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    has_text: { type: Type.BOOLEAN },
    page_confidence: { type: Type.INTEGER },
    bubbles: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          box_2d: {
            type: Type.ARRAY,
            items: { type: Type.INTEGER },
          },
          original_text: { type: Type.STRING },
          translated_text: { type: Type.STRING },
          type: {
            type: Type.STRING,
            enum: [...BUBBLE_TYPES],
          },
          confidence: { type: Type.INTEGER },
        },
        required: [
          "box_2d",
          "original_text",
          "translated_text",
          "type",
          "confidence",
        ],
      },
    },
  },
  required: ["has_text", "page_confidence", "bubbles"],
};

export const buildGenerationConfig = (
  modelName: string,
): GenerateContentConfig => ({
  responseMimeType: "application/json",
  responseSchema: TRANSLATION_RESPONSE_SCHEMA,
  temperature: 0.1,
  topP: 0.9,
  maxOutputTokens: 8192,
  thinkingConfig: modelName.startsWith("gemini-3")
    ? { thinkingLevel: ThinkingLevel.LOW }
    : { thinkingBudget: 0 },
  safetySettings: [
    {
      category: HarmCategory.HARM_CATEGORY_HARASSMENT,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
  ],
});

export const generateTranslation = async ({
  apiKey,
  modelName,
  base64Image,
  mimeType,
  prompt,
  billingMode = "standard",
}: {
  apiKey: string;
  modelName: string;
  base64Image: string;
  mimeType: string;
  prompt: string;
  billingMode?: UsageBreakdown["billingMode"];
}): Promise<TranslationAttempt> => {
  const client = new GoogleGenAI({ apiKey });
  const response = await client.models.generateContent({
    model: modelName,
    contents: {
      parts: [
        { text: prompt },
        { inlineData: { mimeType, data: base64Image } },
      ],
    },
    config: buildGenerationConfig(modelName),
  });

  const usage = usageFromResponse(response, modelName, billingMode);
  try {
    if (!response.text) throw new Error("Gemini returned an empty response");
    return {
      parsed: parseTranslationResponse(response.text),
      usage,
    };
  } catch (error) {
    const attemptError = new Error(
      error instanceof Error ? error.message : "Gemini response could not be parsed",
    ) as TranslationAttemptError;
    attemptError.usage = usage;
    throw attemptError;
  }
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const normalizeConfidence = (value: unknown) => {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0.5;
  return clamp(numeric > 1 ? numeric / 100 : numeric, 0, 1);
};

const sanitizeBox = (
  value: unknown,
): [number, number, number, number] | null => {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const values = value.map(Number);
  if (values.some((item) => !Number.isFinite(item))) return null;

  const [rawY1, rawX1, rawY2, rawX2] = values;
  const ymin = Math.round(clamp(Math.min(rawY1, rawY2), 0, 1000));
  const xmin = Math.round(clamp(Math.min(rawX1, rawX2), 0, 1000));
  const ymax = Math.round(clamp(Math.max(rawY1, rawY2), 0, 1000));
  const xmax = Math.round(clamp(Math.max(rawX1, rawX2), 0, 1000));

  if (ymax - ymin < 4 || xmax - xmin < 4) return null;
  return [ymin, xmin, ymax, xmax];
};

const sanitizeBubble = (value: unknown): TextBubble | null => {
  if (!value || typeof value !== "object") return null;
  const raw = value as RawBubble;
  const box = sanitizeBox(raw.box_2d);
  const originalText = String(raw.original_text || "").trim();
  const translatedText = String(raw.translated_text || "").trim();
  const rawType = String(raw.type || "").toLowerCase();
  const type = BUBBLE_TYPES.includes(
    rawType as (typeof BUBBLE_TYPES)[number],
  )
    ? (rawType as TextBubble["type"])
    : "speech";

  if (!box || !originalText || !translatedText) return null;

  return {
    box_2d: box,
    original_text: originalText,
    translated_text: translatedText,
    type,
    confidence: normalizeConfidence(raw.confidence),
  };
};

const boxIou = (a: TextBubble["box_2d"], b: TextBubble["box_2d"]) => {
  const intersectionWidth = Math.max(
    0,
    Math.min(a[3], b[3]) - Math.max(a[1], b[1]),
  );
  const intersectionHeight = Math.max(
    0,
    Math.min(a[2], b[2]) - Math.max(a[0], b[0]),
  );
  const intersection = intersectionWidth * intersectionHeight;
  const areaA = (a[3] - a[1]) * (a[2] - a[0]);
  const areaB = (b[3] - b[1]) * (b[2] - b[0]);
  return intersection / Math.max(1, areaA + areaB - intersection);
};

const deduplicateBubbles = (bubbles: TextBubble[]) => {
  const result: TextBubble[] = [];
  for (const bubble of bubbles) {
    const duplicateIndex = result.findIndex(
      (candidate) =>
        boxIou(candidate.box_2d, bubble.box_2d) >= 0.82 &&
        candidate.original_text.replace(/\s/g, "") ===
          bubble.original_text.replace(/\s/g, ""),
    );

    if (duplicateIndex === -1) {
      result.push(bubble);
      continue;
    }

    if ((bubble.confidence || 0) > (result[duplicateIndex].confidence || 0)) {
      result[duplicateIndex] = bubble;
    }
  }
  return result;
};

export const parseTranslationResponse = (text: string): ParsedTranslation => {
  const decoded = JSON.parse(text) as RawTranslationResponse | unknown[];
  const legacyArray = Array.isArray(decoded);
  const rawBubbles = legacyArray
    ? decoded
    : Array.isArray(decoded.bubbles)
      ? decoded.bubbles
      : [];
  const bubbles = deduplicateBubbles(
    rawBubbles.map(sanitizeBubble).filter((item): item is TextBubble => !!item),
  );
  const pageConfidence = legacyArray
    ? bubbles.length > 0
      ? Math.min(
          ...bubbles.map((bubble) => bubble.confidence ?? 0.5),
        )
      : 0.5
    : normalizeConfidence(decoded.page_confidence);
  const hasText = legacyArray ? bubbles.length > 0 : decoded.has_text === true;
  const lowBubbleConfidence = bubbles.some(
    (bubble) => (bubble.confidence ?? 0.5) < 0.45,
  );

  return {
    bubbles,
    pageConfidence,
    hasText,
    shouldFallback:
      (hasText && bubbles.length === 0) ||
      pageConfidence < 0.55 ||
      lowBubbleConfidence,
  };
};

export const usageFromResponse = (
  response: GenerateContentResponse,
  model: string,
  billingMode: UsageBreakdown["billingMode"],
): UsageBreakdown => ({
  model,
  billingMode,
  promptTokenCount: response.usageMetadata?.promptTokenCount || 0,
  candidatesTokenCount: response.usageMetadata?.candidatesTokenCount || 0,
  thoughtsTokenCount: response.usageMetadata?.thoughtsTokenCount || 0,
  totalTokenCount: response.usageMetadata?.totalTokenCount || 0,
});

export const combineUsage = (
  entries: UsageBreakdown[],
  modelUsed: string,
  fallbackUsed: boolean,
): UsageMetadata => ({
  promptTokenCount: entries.reduce(
    (total, entry) => total + entry.promptTokenCount,
    0,
  ),
  candidatesTokenCount: entries.reduce(
    (total, entry) => total + entry.candidatesTokenCount,
    0,
  ),
  thoughtsTokenCount: entries.reduce(
    (total, entry) => total + entry.thoughtsTokenCount,
    0,
  ),
  totalTokenCount: entries.reduce(
    (total, entry) => total + entry.totalTokenCount,
    0,
  ),
  breakdown: entries,
  modelUsed,
  fallbackUsed,
});
