export interface TextBubble {
  box_2d: [number, number, number, number];
  /** Refined client-side layout box. `box_2d` remains the model output. */
  render_box_2d?: [number, number, number, number];
  original_text: string;
  translated_text: string;
  type: "speech" | "caption" | "sfx" | "label" | "dialogue" | "environmental";
  /** Model confidence normalized to 0-1. Used only as a fallback signal. */
  confidence?: number;
  refinement?: "local-mask" | "model-box";
}

export interface UsageBreakdown {
  model: string;
  /** Provider account name; absent on usage recorded before providers existed. */
  provider?: string;
  /** Priced when the call was made; absent on old Gemini-only usage. */
  costUsd?: number;
  billingMode: "standard" | "batch";
  promptTokenCount: number;
  candidatesTokenCount: number;
  thoughtsTokenCount: number;
  totalTokenCount: number;
}

export interface UsageMetadata {
  promptTokenCount: number;
  candidatesTokenCount: number;
  thoughtsTokenCount: number;
  totalTokenCount: number;
  breakdown?: UsageBreakdown[];
  modelUsed?: string;
  fallbackUsed?: boolean;
  processing?: ProcessingMetadata;
}

/** How a page was processed. Older records carry Gemini/local-OCR values. */
export interface ProcessingMetadata {
  requestedPipeline?: string;
  actualPipeline?: string;
  detection: {
    provider: string;
    model: string;
    workerId?: string;
    device?: string;
    durationMs?: number;
    regions?: number;
    mangaOcrEnabled?: boolean;
  };
  /** The model that read the lettering (provider-neutral pipeline). */
  reading?: { provider: string; model: string; fallbackUsed: boolean };
  translation: {
    provider: string;
    model: string;
    inputMode: "image" | "text";
    fallbackUsed: boolean;
  };
  completedAt: string;
}

export interface LocalOcrRunMetadata {
  engine: string;
  device: string;
  durationMs: number;
  regions: number;
  mangaOcrEnabled: boolean;
}

export interface BatchTranslationItemResult {
  imageId: string;
  usage: UsageMetadata;
  cost?: number;
  error?: string;
  /** The page was translated, rendered and stored on the server. */
  applied?: boolean;
  translatedKey?: string;
}

export interface BatchTranslationJobSummary {
  id: string;
  imageIds: string[];
  status: "queued" | "running" | "completed" | "failed";
  results?: BatchTranslationItemResult[];
  error?: string;
}

export interface LocalOcrBubble {
  id: string;
  box_2d: [number, number, number, number];
  original_text: string;
  confidence: number;
  type?: TextBubble["type"] | "thought";
}

/** "gemini_batch" and "local_ocr" appear only on jobs from before they were removed. */
export type PageJobProvider = "ai" | "migration" | "gemini" | "gemini_batch" | "local_ocr";
export type PageJobStage =
  | "queued"
  | "detecting"
  | "translating"
  | "rendering"
  | "completed"
  | "failed"
  | "cancelled";

/** Per-job overrides of the user's stored settings. Older rows may carry more fields. */
export interface PageJobOptions {
  targetLanguage?: string;
  customInstructions?: string;
}

export interface PageJobSummary {
  id: string;
  imageId: string;
  seriesId: string;
  provider: PageJobProvider;
  stage: PageJobStage;
  attempts: number;
  error?: string;
  cost?: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface ProcessedImage {
  id: string;
  originalUrl: string;
  translatedUrl: string | null;
  status: "idle" | "processing" | "completed" | "error";
  fileName: string;
  originalKey?: string;
  translatedKey?: string;
  sequenceNumber: number;
  usage?: UsageMetadata;
  cost?: number;
  /** 1 = legacy flattened render, 2 = rendered from a layout document. */
  layoutVersion?: number;
  legacyTranslatedKey?: string | null;
  /** Presigned URL of the kept v1 render, for migration review. */
  legacyTranslatedUrl?: string | null;
  /** v1 page carries bubble data and can be migrated without a model call. */
  hasLegacyBubbles?: boolean;
  renderedAt?: string | Date | null;
}

/** One configured AI provider account. */
export interface AiProviderConfig {
  id: string;
  name: string;
  /** Catalog preset this account was created from (gemini, openai, deepseek, …). */
  preset: string;
  kind: "gemini" | "openai";
  /** OpenAI-compatible providers only. */
  baseUrl?: string;
  /** Rotated on rate limits. */
  apiKeys: string[];
  /**
   * The keys are on a free plan: calls are tracked against the free limits
   * and cost nothing. Absent on accounts saved before this existed (paid).
   */
  freeTier?: boolean;
}

/** A model picked for one pipeline stage. */
export interface AiModelChoice {
  providerId: string;
  model: string;
  /** USD per 1M tokens, for models the catalog does not price. */
  inputPer1M?: number;
  outputPer1M?: number;
}

export interface AiSettings {
  providers: AiProviderConfig[];
  /** Reads the lettering from the page crops. Must accept images. */
  reader: AiModelChoice;
  /** Translates the transcribed text. Any text model. */
  translator: AiModelChoice;
  /** Tried when the reader keeps failing (rate limits, outages). */
  readerFallback?: AiModelChoice;
  /** Tried when the translator keeps failing. */
  translatorFallback?: AiModelChoice;
}

export interface TranslationSettings {
  ai?: AiSettings;
  targetLanguage: string;
  customInstructions?: string;
  /** Show pipeline, model, token and timing details on each page card. */
  developerMode?: boolean;
  // Fields below come from accounts saved before the provider-neutral AI
  // settings. They are read once to build `ai` and never written again.
  translationPipeline?: string;
  model?: string;
  fallbackModel?: string;
  enableQualityFallback?: boolean;
  useGeminiBatch?: boolean;
  batchSize?: number;
  batchDelay?: number;
  useCustomApiKey?: boolean;
  customApiKeyPool?: string;
  namedApiKeys?: NamedApiKey[];
}

export interface NamedApiKey {
  id: string;
  name: string;
  key: string;
  enabled?: boolean;
}

export interface ImagePair {
  id: string;
  title: string;
  sourceUrl: string;
  convertedUrl: string;
  createdAt: number;
}

export interface Category {
  id: string;
  name: string;
  parentId: string | null;
  color?: string;
}

export interface Series {
  id: string;
  name: string;
  description: string;
  category: string;
  categoryId?: string;
  tags: string[];
  images: ProcessedImage[];
  previewImages?: string[];
  imageCount?: number;
  completedCount?: number;
  errorCount?: number;
  sequenceNumber: number;
  createdAt: number;
  updatedAt: number;
  author?: string;
  group?: string;
  originalTitle?: string;
  contentMode?: "standard" | "adult_verified";
}

export interface SeriesInput {
  name: string;
  description?: string;
  categoryId?: string;
  author?: string;
  groupName?: string;
  originalTitle?: string;
  sequenceNumber?: number;
  tags?: string[];
  contentMode?: "standard" | "adult_verified";
}

export interface ImageUpdateInput {
  fileName?: string;
  originalKey?: string;
  translatedKey?: string;
  status?: ProcessedImage["status"];
  sequenceNumber?: number;
  bubbles?: TextBubble[];
  usage?: UsageMetadata | null;
  cost?: number;
}

export type ViewMode = "slider" | "toggle" | "side-by-side" | "grid";

export interface ConfirmConfig {
  title: string;
  message: string;
  onConfirm: () => void;
  type?: "danger" | "warning";
}
