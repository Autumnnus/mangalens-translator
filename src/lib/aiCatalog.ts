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
  /** USD per 1M tokens; output includes reasoning tokens. */
  inputPer1M?: number;
  outputPer1M?: number;
  note?: string;
}

export interface ProviderPreset {
  id: string;
  label: string;
  kind: AiProviderKind;
  baseUrl?: string;
  keyHint: string;
  models: CatalogModel[];
}

// Gemini prices: ai.google.dev/gemini-api/docs/pricing (September 2026).
// 3.6-3.8 Flash are promotional until 2026-12-31 and double afterwards.
const GEMINI_MODELS: CatalogModel[] = [
  { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite", vision: true, inputPer1M: 0.25, outputPer1M: 1.5 },
  { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite", vision: true, inputPer1M: 0.3, outputPer1M: 2.5 },
  { id: "gemini-3-flash-preview", label: "Gemini 3 Flash (Preview)", vision: true, inputPer1M: 0.5, outputPer1M: 3 },
  { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash", vision: true, inputPer1M: 0.75, outputPer1M: 3.75, note: "Promotional price" },
  { id: "gemini-3.7-flash", label: "Gemini 3.7 Flash", vision: true, inputPer1M: 0.75, outputPer1M: 3.75, note: "Promotional price" },
  { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash", vision: true, inputPer1M: 0.75, outputPer1M: 3.75, note: "Promotional price" },
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash", vision: true, inputPer1M: 1.5, outputPer1M: 9 },
  { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (Preview)", vision: true, inputPer1M: 2, outputPer1M: 12 },
];

export const PROVIDER_PRESETS: ProviderPreset[] = [
  { id: "gemini", label: "Google Gemini", kind: "gemini", keyHint: "AIza…", models: GEMINI_MODELS },
  {
    id: "openai",
    label: "OpenAI",
    kind: "openai",
    baseUrl: "https://api.openai.com/v1",
    keyHint: "sk-…",
    models: [],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    kind: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
    keyHint: "sk-or-…",
    models: [],
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    kind: "openai",
    baseUrl: "https://api.deepseek.com/v1",
    keyHint: "sk-…",
    models: [
      { id: "deepseek-chat", label: "DeepSeek Chat", vision: false },
      { id: "deepseek-reasoner", label: "DeepSeek Reasoner", vision: false },
    ],
  },
  {
    id: "glm",
    label: "Zhipu GLM",
    kind: "openai",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    keyHint: "…",
    models: [],
  },
  {
    id: "qwen",
    label: "Alibaba Qwen (DashScope)",
    kind: "openai",
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    keyHint: "sk-…",
    models: [],
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
