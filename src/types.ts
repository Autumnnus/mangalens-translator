export interface TextBubble {
  box_2d: [number, number, number, number];
  /** Refined client-side layout box. `box_2d` remains the model output. */
  render_box_2d?: [number, number, number, number];
  original_text: string;
  translated_text: string;
  type:
    | "speech"
    | "caption"
    | "sfx"
    | "label"
    | "dialogue"
    | "environmental";
  /** Model confidence normalized to 0-1. Used only as a fallback signal. */
  confidence?: number;
  refinement?: "local-mask" | "model-box";
}

export interface UsageBreakdown {
  model: string;
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

export interface ProcessingMetadata {
  requestedPipeline: "auto" | "gemini_vision" | "local_ocr";
  actualPipeline: "gemini_vision" | "local_ocr";
  detection: {
    provider: "gemini" | "paddleocr" | "legacy";
    model: string;
    workerId?: string;
    device?: string;
    durationMs?: number;
    regions?: number;
    mangaOcrEnabled?: boolean;
  };
  translation: {
    provider: "gemini";
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

export type PageJobProvider = "gemini" | "gemini_batch" | "local_ocr" | "migration";
export type PageJobStage =
  | "queued"
  | "detecting"
  | "translating"
  | "rendering"
  | "completed"
  | "failed"
  | "cancelled";

/** Per-job overrides of the user's stored settings. */
export interface PageJobOptions {
  targetLanguage?: string;
  customInstructions?: string;
  model?: string;
  fallbackModel?: string;
  enableQualityFallback?: boolean;
  /** Batch jobs: detector blocks the numbered overlay was built from. */
  detection?: {
    mode: "read" | "detect";
    blocks?: Array<{ box: { x: number; y: number; w: number; h: number }; lines: Array<{ box: { x: number; y: number; w: number; h: number }; score: number }>; score: number }>;
  };
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
  /** Local OCR: nothing happens until the Mac worker claims the page. */
  waitingForWorker: boolean;
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

export interface GeminiModel {
  id: string;
  name: string;
  inputCostPer1k: number;
  outputCostPer1k: number;
  batchInputCostPer1k: number;
  batchOutputCostPer1k: number;
  description: string;
}

export const GEMINI_MODELS: GeminiModel[] = [
  {
    id: "gemini-2.5-flash-lite",
    name: "Gemini 2.5 Flash-Lite",
    inputCostPer1k: 0.0001,
    outputCostPer1k: 0.0004,
    batchInputCostPer1k: 0.00005,
    batchOutputCostPer1k: 0.0002,
    description: "Default low-cost model for high-volume comic translation.",
  },
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    inputCostPer1k: 0.0003,
    outputCostPer1k: 0.0025,
    batchInputCostPer1k: 0.00015,
    batchOutputCostPer1k: 0.00125,
    description: "Quality fallback for uncertain pages.",
  },
  {
    id: "gemini-3-flash-preview",
    name: "Gemini 3 Flash (Preview)",
    inputCostPer1k: 0.0005,
    outputCostPer1k: 0.003,
    batchInputCostPer1k: 0.00025,
    batchOutputCostPer1k: 0.0015,
    description: "Preview model with stronger output quality.",
  },
];

export interface TranslationSettings {
  targetLanguage: string;
  translationPipeline?: "auto" | "gemini_vision" | "local_ocr";
  developerMode?: boolean;
  customInstructions?: string;
  model: string;
  fallbackModel?: string;
  enableQualityFallback?: boolean;
  useGeminiBatch?: boolean;
  batchSize: number;
  batchDelay: number;
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
