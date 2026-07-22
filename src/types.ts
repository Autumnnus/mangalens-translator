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
}

export interface BatchTranslationItemResult {
  imageId: string;
  bubbles: TextBubble[];
  usage: UsageMetadata;
  error?: string;
}

export interface BatchTranslationJobSummary {
  id: string;
  imageIds: string[];
  status: "queued" | "running" | "completed" | "failed";
  results?: BatchTranslationItemResult[];
  error?: string;
}

export interface ProcessedImage {
  id: string;
  originalUrl: string;
  translatedUrl: string | null;
  status: "idle" | "processing" | "completed" | "error";
  bubbles: TextBubble[];
  fileName: string;
  originalKey?: string;
  translatedKey?: string;
  sequenceNumber: number;
  usage?: UsageMetadata;
  cost?: number;
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
  fontSize: number;
  fontColor: string;
  backgroundColor: string;
  strokeColor: string;
  customInstructions?: string;
  model: string;
  fallbackModel?: string;
  enableQualityFallback?: boolean;
  useGeminiBatch?: boolean;
  refineBubbles?: boolean;
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
  sequenceNumber: number;
  createdAt: number;
  updatedAt: number;
  author?: string;
  group?: string;
  originalTitle?: string;
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
