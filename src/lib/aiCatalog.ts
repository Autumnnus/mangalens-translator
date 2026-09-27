/**
 * Providers and models the settings screen offers. Isomorphic: the settings
 * UI lists them and the server prices usage with them. Any model id can be
 * typed in by hand; prices are then taken from the user's own entry.
 */

export type AiProviderKind = "gemini" | "openai";

export interface CatalogModel {
  id: string;
  label: string;
  /** Can read images (needed for the reading stage). */
  vision: boolean;
  /** USD per 1M tokens; output includes reasoning tokens. Free models are 0. */
  inputPer1M?: number;
  outputPer1M?: number;
  /** Free quota, shown next to the model ("50 requests/day"). */
  free?: string;
  /**
   * Known free-plan limits. Providers change them; a limit a provider reports
   * at runtime (rate-limit headers, quota errors) always wins over these.
   */
  freeLimit?: FreeLimit;
  /** One line on what the model is good for in this app. */
  summary?: string;
  note?: string;
}

export interface FreeLimit {
  requestsPerDay?: number;
  requestsPerMinute?: number;
  tokensPerMinute?: number;
}

export interface ProviderPreset {
  id: string;
  label: string;
  kind: AiProviderKind;
  baseUrl?: string;
  keyHint: string;
  /** Where to get a key, shown on the provider card. */
  keyUrl?: string;
  /** Short description of the provider's free offer, if any. */
  freeTier?: string;
  /** Time zone whose midnight resets daily quotas (default UTC). */
  quotaTimeZone?: string;
  /**
   * The daily free limit is shared by all free models of the account
   * (OpenRouter) instead of counted per model.
   */
  sharedDailyLimit?: number;
  models: CatalogModel[];
}

/**
 * Typical tokens of one page, measured on real pages (8k-27k tokens total):
 * reading sends the page plus one crop per balloon, translation is text only.
 */
export const PAGE_TOKENS = {
  reading: { input: 12_000, output: 2_000 },
  translation: { input: 2_000, output: 1_000 },
} as const;

/** Approximate USD one page costs a model in the given stage, or undefined when unpriced. */
export const pageCost = (
  model: { inputPer1M?: number; outputPer1M?: number },
  stage: keyof typeof PAGE_TOKENS,
) => {
  if (model.inputPer1M === undefined || model.outputPer1M === undefined) return undefined;
  const tokens = PAGE_TOKENS[stage];
  return (tokens.input * model.inputPer1M + tokens.output * model.outputPer1M) / 1_000_000;
};

// Gemini prices: ai.google.dev/gemini-api/docs/pricing (September 2026).
// 3.6-3.8 Flash are promotional until 2026-12-31 and double afterwards.
const GEMINI_FREE = "Free tier: ~20 requests/day per model";
// Observed on free keys (quota GenerateRequestsPerDayPerProjectPerModel-FreeTier).
const GEMINI_FREE_LIMIT: FreeLimit = { requestsPerDay: 20 };
const GEMINI_MODELS: CatalogModel[] = [
  { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite", vision: true, inputPer1M: 0.25, outputPer1M: 1.5, free: GEMINI_FREE, freeLimit: GEMINI_FREE_LIMIT, summary: "Cheapest and fastest; mixes up balloons more often." },
  { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite", vision: true, inputPer1M: 0.3, outputPer1M: 2.5, free: GEMINI_FREE, freeLimit: GEMINI_FREE_LIMIT, summary: "Cheap, a step above 3.1 Flash-Lite." },
  { id: "gemini-3-flash-preview", label: "Gemini 3 Flash (Preview)", vision: true, inputPer1M: 0.5, outputPer1M: 3, free: GEMINI_FREE, freeLimit: GEMINI_FREE_LIMIT, summary: "Recommended reader: accurate and still cheap." },
  { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash", vision: true, inputPer1M: 0.75, outputPer1M: 3.75, free: GEMINI_FREE, freeLimit: GEMINI_FREE_LIMIT, note: "Promotional price" },
  { id: "gemini-3.7-flash", label: "Gemini 3.7 Flash", vision: true, inputPer1M: 0.75, outputPer1M: 3.75, free: GEMINI_FREE, freeLimit: GEMINI_FREE_LIMIT, note: "Promotional price" },
  { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash", vision: true, inputPer1M: 0.75, outputPer1M: 3.75, free: GEMINI_FREE, freeLimit: GEMINI_FREE_LIMIT, note: "Promotional price" },
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash", vision: true, inputPer1M: 1.5, outputPer1M: 9, summary: "Strong reader and translator, pricier." },
  { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (Preview)", vision: true, inputPer1M: 2, outputPer1M: 12, summary: "Best quality, slow and expensive; rarely needed." },
];

// GLM models are served both by Z.ai (international) and BigModel (China).
const GLM_MODELS: CatalogModel[] = [
  { id: "glm-4.6v-flash", label: "GLM-4.6V Flash", vision: true, inputPer1M: 0, outputPer1M: 0, free: "Completely free (rate limited)", summary: "Free small vision model; fine for testing, weaker on hard pages." },
  { id: "glm-4.6v-flashx", label: "GLM-4.6V FlashX", vision: true, summary: "Cheap fast vision model." },
  { id: "glm-4.6v", label: "GLM-4.6V", vision: true, summary: "Full vision model, better reading." },
];

// Prices checked September 2026; free OpenRouter ids change often, any id can be typed in.
export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "gemini",
    label: "Google Gemini",
    kind: "gemini",
    keyHint: "AIza…",
    keyUrl: "https://aistudio.google.com/apikey",
    quotaTimeZone: "America/Los_Angeles",
    freeTier: "Free daily quota on Flash models, no card needed.",
    models: GEMINI_MODELS,
  },
  {
    id: "mistral",
    label: "Mistral",
    kind: "openai",
    baseUrl: "https://api.mistral.ai/v1",
    keyHint: "…",
    keyUrl: "https://console.mistral.ai/api-keys",
    freeTier: "Free Experiment plan (~1B tokens/month, ~1 request/s); requires allowing training on your data.",
    models: [
      { id: "mistral-small-latest", label: "Mistral Small", vision: true, inputPer1M: 0.15, outputPer1M: 0.6, free: "Free on Experiment plan", summary: "Cheap vision model; good free reader to try first." },
      { id: "mistral-large-latest", label: "Mistral Large", vision: true, inputPer1M: 0.5, outputPer1M: 1.5, free: "Free on Experiment plan", summary: "Best Mistral reader and translator." },
      { id: "mistral-medium-latest", label: "Mistral Medium", vision: true, inputPer1M: 1.5, outputPer1M: 7.5, free: "Free on Experiment plan" },
    ],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    kind: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
    keyHint: "sk-or-…",
    keyUrl: "https://openrouter.ai/keys",
    freeTier: "Models ending in :free cost nothing: 50 requests/day in total, 1000/day once you have bought $10 of credit (one time).",
    sharedDailyLimit: 50,
    models: [
      { id: "google/gemma-4-31b-it:free", label: "Gemma 4 31B (free)", vision: true, inputPer1M: 0, outputPer1M: 0, free: "OpenRouter free quota", freeLimit: { requestsPerMinute: 20 }, summary: "Free open model; plain OCR close to Gemini Flash, weaker on stylised text and ~8× slower. Good as a backup reader." },
      { id: "qwen/qwen3.8-27b:free", label: "Qwen 3.8 27B (free)", vision: true, inputPer1M: 0, outputPer1M: 0, free: "OpenRouter free quota", freeLimit: { requestsPerMinute: 20 }, summary: "Free vision model, good with CJK text." },
      { id: "google/gemma-4-26b-a4b-it:free", label: "Gemma 4 26B A4B (free)", vision: true, inputPer1M: 0, outputPer1M: 0, free: "OpenRouter free quota", freeLimit: { requestsPerMinute: 20 }, summary: "Faster, smaller free Gemma." },
      { id: "nvidia/nemotron-3-super-120b-a12b:free", label: "Nemotron 3 Super (free, text)", vision: false, inputPer1M: 0, outputPer1M: 0, free: "OpenRouter free quota", freeLimit: { requestsPerMinute: 20 }, summary: "Free text model for translation only." },
    ],
  },
  {
    id: "zai",
    label: "Z.ai GLM",
    kind: "openai",
    baseUrl: "https://api.z.ai/api/paas/v4",
    keyHint: "…",
    keyUrl: "https://z.ai/manage-apikey/apikey-list",
    freeTier: "GLM-4.6V Flash is free.",
    models: GLM_MODELS,
  },
  {
    id: "groq",
    label: "Groq",
    kind: "openai",
    baseUrl: "https://api.groq.com/openai/v1",
    keyHint: "gsk_…",
    keyUrl: "https://console.groq.com/keys",
    freeTier: "Free: 1000 requests/day but only 6000 tokens/minute, often too little for a full page.",
    models: [
      { id: "meta-llama/llama-4-scout-17b-16e-instruct", label: "Llama 4 Scout", vision: true, inputPer1M: 0.11, outputPer1M: 0.34, free: "Groq free tier (6K tokens/min)", freeLimit: { requestsPerDay: 1000, requestsPerMinute: 30, tokensPerMinute: 6000 }, summary: "Very fast; free limit may reject large pages." },
      { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B (text)", vision: false, inputPer1M: 0.15, outputPer1M: 0.6, free: "Groq free tier", freeLimit: { requestsPerDay: 1000, requestsPerMinute: 30, tokensPerMinute: 8000 }, summary: "Fast free translator; text only." },
    ],
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    kind: "openai",
    baseUrl: "https://api.deepseek.com/v1",
    keyHint: "sk-…",
    keyUrl: "https://platform.deepseek.com/api_keys",
    freeTier: "No free plan; text only, so it can translate but cannot read pages.",
    models: [
      { id: "deepseek-chat", label: "DeepSeek Chat", vision: false, inputPer1M: 0.28, outputPer1M: 0.42, summary: "Very cheap, good translator. Cannot read images." },
      { id: "deepseek-reasoner", label: "DeepSeek Reasoner", vision: false, inputPer1M: 0.28, outputPer1M: 0.42, summary: "Thinks before answering; slower, rarely better for dialogue." },
    ],
  },
  {
    id: "openai",
    label: "OpenAI",
    kind: "openai",
    baseUrl: "https://api.openai.com/v1",
    keyHint: "sk-…",
    keyUrl: "https://platform.openai.com/api-keys",
    models: [],
  },
  {
    id: "glm",
    label: "Zhipu GLM (China)",
    kind: "openai",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    keyHint: "…",
    models: GLM_MODELS,
  },
  {
    id: "qwen",
    label: "Alibaba Qwen (DashScope)",
    kind: "openai",
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    keyHint: "sk-…",
    keyUrl: "https://modelstudio.console.alibabacloud.com/",
    freeTier: "New accounts get a one-time free token quota.",
    models: [
      { id: "qwen-vl-max", label: "Qwen VL Max", vision: true, summary: "Qwen's strongest vision model." },
      { id: "qwen-vl-plus", label: "Qwen VL Plus", vision: true, summary: "Cheaper Qwen vision model." },
      { id: "qwen-plus", label: "Qwen Plus (text)", vision: false, summary: "Text model for translation." },
    ],
  },
  { id: "custom", label: "Other OpenAI-compatible", kind: "openai", baseUrl: "", keyHint: "…", models: [] },
];

export const presetById = (id: string) => PROVIDER_PRESETS.find((preset) => preset.id === id);

export const catalogModel = (modelId: string) => {
  for (const preset of PROVIDER_PRESETS) {
    const model = preset.models.find((entry) => entry.id === modelId);
    if (model) return model;
  }
  return undefined;
};

export const DEFAULT_READER_MODEL = "gemini-3-flash-preview";

/**
 * Ready-made model setups the settings screen offers. Each stage names a
 * preset and a model; applying a recipe adds any missing provider.
 */
export interface SetupRecipe {
  id: string;
  label: string;
  summary: string;
  free: boolean;
  reader: [preset: string, model: string];
  translator: [preset: string, model: string];
  readerFallback?: [preset: string, model: string];
  translatorFallback?: [preset: string, model: string];
}

export const SETUP_RECIPES: SetupRecipe[] = [
  {
    id: "free-gemini",
    label: "Free · Gemini only",
    summary:
      "Every Gemini model has its own daily free quota, so reading and translating on different models about doubles the pages per day.",
    free: true,
    reader: ["gemini", "gemini-3-flash-preview"],
    translator: ["gemini", "gemini-3.1-flash-lite"],
    readerFallback: ["gemini", "gemini-3.5-flash-lite"],
  },
  {
    id: "free-mix",
    label: "Free · Gemini + Mistral",
    summary:
      "Gemini reads, Mistral translates and takes over reading when Gemini's daily quota runs out. The most pages per day for free.",
    free: true,
    reader: ["gemini", "gemini-3-flash-preview"],
    translator: ["mistral", "mistral-large-latest"],
    readerFallback: ["mistral", "mistral-small-latest"],
    translatorFallback: ["gemini", "gemini-3.1-flash-lite"],
  },
  {
    id: "free-openrouter",
    label: "Free · OpenRouter",
    summary:
      "Open models through one key. Noticeably below Gemini Flash on stylised lettering and much slower; best as a backup. 50 requests a day in total (about 25 pages), 1000 after a one-time $10 top-up.",
    free: true,
    reader: ["openrouter", "google/gemma-4-31b-it:free"],
    translator: ["openrouter", "google/gemma-4-31b-it:free"],
    readerFallback: ["openrouter", "qwen/qwen3.8-27b:free"],
    translatorFallback: ["openrouter", "nvidia/nemotron-3-super-120b-a12b:free"],
  },
  {
    id: "cheap-paid",
    label: "Paid · Gemini + DeepSeek",
    summary: "Accurate Gemini reading with very cheap DeepSeek translation, about a cent per page.",
    free: false,
    reader: ["gemini", "gemini-3-flash-preview"],
    translator: ["deepseek", "deepseek-chat"],
    translatorFallback: ["gemini", "gemini-3.1-flash-lite"],
  },
];
