import { RegionKind } from "@/layout/types";
import { callModel } from "@/server/llm/run";
import { AiSettings, UsageBreakdown } from "@/types";

/**
 * Translation stage: text only, one call per page with every item in reading
 * order, so it is cheap to re-run and works with any text model. The model
 * never sees the image; the reader's scene description, the speaker of each
 * line and the pages before this one stand in for it.
 */

export interface TranslationItem {
  id: string;
  kind: RegionKind;
  text: string;
  speaker?: string;
}

export interface StoryLine {
  speaker?: string;
  source: string;
  translation: string;
}

/** An earlier, already translated page of the same series. */
export interface StoryPage {
  scene?: string;
  lines: StoryLine[];
}

export interface TranslationContext {
  seriesTitle?: string | null;
  originalTitle?: string | null;
  author?: string | null;
  sourceLanguage?: string | null;
  /** Free-form glossary, e.g. "Kaito -> Kaito (keep)". */
  glossary?: string | null;
  /** The series is marked as verified adult content. */
  adult?: boolean;
  /** What happens on this page, from the reader. */
  scene?: string | null;
  /** Earlier pages, oldest first. */
  story?: StoryPage[];
  /** Lines of this page that are already translated and not being redone. */
  pageLines?: StoryLine[];
}

/** Hearts only exist in the dialogue font; other kinds would render tofu. */
const HEART_KINDS: ReadonlySet<RegionKind> = new Set(["speech", "thought"]);

const formatLine = (line: StoryLine) =>
  `  ${line.speaker ? `[${line.speaker}] ` : ""}${line.source} => ${line.translation}`;

const formatStory = (story: StoryPage[]) =>
  story
    .map((page, index) => {
      const lines = page.lines.map(formatLine);
      return [`Page -${story.length - index}${page.scene ? `: ${page.scene}` : ""}`, ...lines].join("\n");
    })
    .join("\n");

const adultRules = (targetLanguage: string) => [
  "This is an adult (18+) erotic work and the editor has verified that every character is an adult. Translate it as erotica, faithfully and with full heat:",
  "- Never soften, censor, euphemise, skip or moralise. Explicit lines stay explicit, crude lines stay crude, tender lines stay tender.",
  `- Use the erotic vocabulary a native adult reader of ${targetLanguage} expects, never clinical or textbook terms.`,
  `- Moans, gasps, panting and cries of pleasure become expressive ${targetLanguage} interjections with stretched vowels, broken words, "..." and "!". Keep hearts (♥) where the source has them, in speech and thought items only.`,
  "- Dirty talk, teasing, begging and confessions should sound seductive and passionate, and follow the escalation of the scene.",
];

/** Warm enough for lively dialogue, cool enough to keep ids and names stable. */
const TEMPERATURE = 0.45;

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
  const story = context?.story?.filter((page) => page.lines.length > 0 || page.scene) || [];

  return [
    `You are an expert manga, comic and webtoon localiser. Translate every item into ${targetLanguage}.`,
    contextLines.length ? contextLines.join("\n") : "",
    story.length
      ? `Earlier pages, already translated (source => translation). Stay consistent with their names, forms of address and voices:\n${formatStory(story)}`
      : "",
    context?.scene?.trim() ? `This page: ${context.scene.trim()}` : "",
    context?.pageLines?.length
      ? `Other lines on this page, already translated (context only; do not return them):\n${context.pageLines.map(formatLine).join("\n")}`
      : "",
    ...(context?.adult ? adultRules(targetLanguage) : []),
    "Rules:",
    "- Translate in context, not line by line. Read the whole page first: who speaks to whom, what just happened, how they relate. Let that decide pronouns, formal or informal address, gender and tone.",
    `- Write the dialogue the way a great scanlation team would: natural, spoken, emotionally alive ${targetLanguage} that sounds as if it had been written in it. Keep the energy of the source: shouts stay loud, whispers stay soft, teasing stays playful, jokes land. Keep stutters, stretched sounds, trailing "..." and "!?" where the source has them.`,
    "- \"speaker\" says who says each line; keep every character's voice and way of speaking consistent. Keep character names consistent; keep honorifics only where natural in the target language.",
    "- Items are in reading order and belong to the same page; a sentence may continue from one balloon into the next.",
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
}): Promise<{ translations: Map<string, string>; model: string; fallbackUsed: boolean }> => {
  if (items.length === 0) return { translations: new Map(), model: ai.translator.model, fallbackUsed: false };
  const prompt = buildTranslationPrompt({ targetLanguage, customInstructions, context, items });
  const kinds = new Map(items.map((item) => [item.id, item.kind]));
  const read = (answer: unknown) => {
    const decoded = (answer || {}) as { translations?: Array<{ id?: unknown; text?: unknown }> };
    const translations = new Map<string, string>();
    for (const entry of decoded.translations || []) {
      const id = String(entry.id || "");
      const kind = kinds.get(id);
      let text = String(entry.text || "");
      if (kind && !HEART_KINDS.has(kind)) text = text.replace(/[♥♡❤]/g, "");
      text = text.replace(/\s+/g, " ").trim();
      if (id && text) translations.set(id, text);
    }
    return translations;
  };
  const answer = await callModel({
    ai,
    choice: ai.translator,
    fallback: ai.translatorFallback,
    stage: "translation",
    request: { parts: [{ type: "text", text: prompt }], schema: TRANSLATION_SCHEMA, temperature: TEMPERATURE },
    usage,
  });
  const translations = read(answer.json);
  const missing = items.filter((item) => !translations.has(item.id));
  if (missing.length > 0) {
    // One retry for just the missing items keeps a single dropped line from failing the page.
    const retry = await callModel({
      ai,
      // Stay on whichever model answered; the fallback is only for failures.
      choice: answer.fallbackUsed && ai.translatorFallback ? ai.translatorFallback : ai.translator,
      fallback: answer.fallbackUsed ? undefined : ai.translatorFallback,
      stage: "translation",
      request: {
        parts: [{ type: "text", text: buildTranslationPrompt({ targetLanguage, customInstructions, context, items: missing }) }],
        schema: TRANSLATION_SCHEMA,
        temperature: TEMPERATURE,
      },
      usage,
    });
    for (const [id, text] of read(retry.json)) translations.set(id, text);
  }
  const stillMissing = items.filter((item) => !translations.has(item.id));
  if (stillMissing.length > 0) {
    throw new Error(`Translation is missing ${stillMissing.length} of ${items.length} items`);
  }
  return { translations, model: answer.model, fallbackUsed: answer.fallbackUsed };
};
