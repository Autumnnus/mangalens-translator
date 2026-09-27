import { RegionKind } from "@/layout/types";
import { callModel } from "@/server/llm/run";
import { AiSettings, UsageBreakdown } from "@/types";

/**
 * Translation stage: text only, one call per page with every item in reading
 * order, so it is cheap to re-run and works with any text model.
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

const TRANSLATION_SCHEMA = {
  type: "object",
  properties: {
    translations: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "string" }, text: { type: "string" } },
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
    "- The translation replaces the lettering in the same balloon, so space is limited: keep each item about as long as the source and prefer natural, compact phrasing over literal, wordy renderings.",
    "- Return exactly one translation per id. Never merge, split, add or omit items.",
    "- Do not insert line breaks; the typesetter wraps text to the balloon.",
    custom ? `Additional instructions from the editor:\n${custom}` : "",
    `Items:\n${JSON.stringify(items)}`,
  ]
    .filter(Boolean)
    .join("\n");
};

export const translateItems = async ({
  ai,
  targetLanguage,
  customInstructions,
  context,
  items,
  usage,
}: {
  ai: AiSettings;
  targetLanguage: string;
  customInstructions?: string | null;
  context?: TranslationContext;
  items: TranslationItem[];
  usage: UsageBreakdown[];
}): Promise<{ translations: Map<string, string>; model: string }> => {
  if (items.length === 0) return { translations: new Map(), model: ai.translator.model };
  const prompt = buildTranslationPrompt({ targetLanguage, customInstructions, context, items });
  const read = (answer: unknown) => {
    const decoded = (answer || {}) as { translations?: Array<{ id?: unknown; text?: unknown }> };
    const translations = new Map<string, string>();
    for (const entry of decoded.translations || []) {
      const id = String(entry.id || "");
      const text = String(entry.text || "").replace(/\s+/g, " ").trim();
      if (id && text) translations.set(id, text);
    }
    return translations;
  };
  const answer = await callModel({
    ai,
    choice: ai.translator,
    request: { parts: [{ type: "text", text: prompt }], schema: TRANSLATION_SCHEMA, temperature: 0.2 },
    usage,
  });
  const translations = read(answer.json);
  const missing = items.filter((item) => !translations.has(item.id));
  if (missing.length > 0) {
    // One retry for just the missing items keeps a single dropped line from failing the page.
    const retry = await callModel({
      ai,
      choice: ai.translator,
      request: {
        parts: [{ type: "text", text: buildTranslationPrompt({ targetLanguage, customInstructions, context, items: missing }) }],
        schema: TRANSLATION_SCHEMA,
        temperature: 0.2,
      },
      usage,
    });
    for (const [id, text] of read(retry.json)) translations.set(id, text);
  }
  const stillMissing = items.filter((item) => !translations.has(item.id));
  if (stillMissing.length > 0) {
    throw new Error(`Translation is missing ${stillMissing.length} of ${items.length} items`);
  }
  return { translations, model: answer.model };
};
