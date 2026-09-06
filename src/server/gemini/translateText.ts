import { GoogleGenAI, Type } from "@google/genai";
import { RegionKind } from "@/layout/types";
import { UsageBreakdown } from "@/types";
import {
  SAFETY_SETTINGS,
  thinkingConfigFor,
  toGeminiCallError,
  usageFromResponse,
} from "./common";

/**
 * Stage 2: text-only translation. Works on already transcribed regions, so it
 * costs a few hundred tokens per page, can be re-run without the image, and is
 * shared by the Gemini Vision and local OCR paths.
 */

export interface TranslationItem {
  id: string;
  kind: RegionKind;
  text: string;
}

export interface TranslationContext {
  seriesTitle?: string | null;
  originalTitle?: string | null;
  author?: string | null;
  sourceLanguage?: string | null;
  /** Free-form glossary, e.g. "Kaito -> Kaito (keep)". */
  glossary?: string | null;
}

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    translations: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          text: { type: Type.STRING },
        },
        required: ["id", "text"],
      },
    },
  },
  required: ["translations"],
};

export const buildTranslationPrompt = ({
  targetLanguage,
  customInstructions,
  context,
  items,
}: {
  targetLanguage: string;
  customInstructions?: string | null;
  context?: TranslationContext;
  items: TranslationItem[];
}) => {
  const contextLines = [
    context?.seriesTitle ? `Series: ${context.seriesTitle}` : "",
    context?.originalTitle ? `Original title: ${context.originalTitle}` : "",
    context?.author ? `Author: ${context.author}` : "",
    context?.sourceLanguage ? `Source language: ${context.sourceLanguage}` : "",
    context?.glossary?.trim() ? `Glossary:\n${context.glossary.trim()}` : "",
  ].filter(Boolean);
  const custom = customInstructions?.trim();

  return [
    `You are a professional manga and comic translator. Translate every item into ${targetLanguage}.`,
    contextLines.length ? contextLines.join("\n") : "",
    "Rules:",
    "- Preserve meaning, tone, register and emotion. Keep character names consistent; keep honorifics only where natural in the target language.",
    "- Items are in reading order and belong to the same page; use the surrounding items as context.",
    '- "sfx" items are onomatopoeia: give a short target-language sound word, not a description.',
    "- Captions and labels stay concise. Do not add explanations, notes or quotation marks.",
    "- Return exactly one translation per id. Never merge, split, add or omit items.",
    "- Do not insert line breaks; the typesetter wraps text to the balloon.",
    custom ? `Additional instructions from the editor:\n${custom}` : "",
    `Items:\n${JSON.stringify(items)}`,
  ]
    .filter(Boolean)
    .join("\n");
};

export const translateItems = async ({
  apiKey,
  modelName,
  targetLanguage,
  customInstructions,
  context,
  items,
}: {
  apiKey: string;
  modelName: string;
  targetLanguage: string;
  customInstructions?: string | null;
  context?: TranslationContext;
  items: TranslationItem[];
}): Promise<{ translations: Map<string, string>; usage: UsageBreakdown }> => {
  if (items.length === 0) {
    return {
      translations: new Map(),
      usage: {
        model: modelName,
        billingMode: "standard",
        promptTokenCount: 0,
        candidatesTokenCount: 0,
        thoughtsTokenCount: 0,
        totalTokenCount: 0,
      },
    };
  }
  const client = new GoogleGenAI({ apiKey });
  const response = await client.models.generateContent({
    model: modelName,
    contents: buildTranslationPrompt({
      targetLanguage,
      customInstructions,
      context,
      items,
    }),
    config: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.2,
      topP: 0.9,
      maxOutputTokens: 8192,
      thinkingConfig: thinkingConfigFor(modelName),
      safetySettings: SAFETY_SETTINGS,
    },
  });
  const usage = usageFromResponse(response, modelName, "standard");
  try {
    if (!response.text) throw new Error("Gemini returned an empty translation");
    const decoded = JSON.parse(response.text) as {
      translations?: Array<{ id?: unknown; text?: unknown }>;
    };
    const translations = new Map<string, string>();
    for (const entry of decoded.translations || []) {
      const id = String(entry.id || "");
      const text = String(entry.text || "").replace(/\s+/g, " ").trim();
      if (id && text) translations.set(id, text);
    }
    const missing = items.filter((item) => !translations.has(item.id));
    if (missing.length > 0) {
      throw new Error(
        `Translation is missing ${missing.length} of ${items.length} items`,
      );
    }
    return { translations, usage };
  } catch (error) {
    throw toGeminiCallError(error, response, usage, "Translation failed");
  }
};
