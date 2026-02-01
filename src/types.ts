export interface TextBubble {
  box_2d: [number, number, number, number];
  original_text: string;
  translated_text: string;
  type: "dialogue" | "environmental";
}

export interface UsageMetadata {
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokenCount: number;
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
  description: string;
}

export const GEMINI_MODELS: GeminiModel[] = [
  {
    id: "gemini-1.5-flash",
    name: "Gemini 1.5 Flash",
    inputCostPer1k: 0.000075,
    outputCostPer1k: 0.0003,
    description: "Fast and cost-effective for most manga tasks.",
  },
  {
    id: "gemini-1.5-pro",
    name: "Gemini 1.5 Pro",
    inputCostPer1k: 0.0035,
    outputCostPer1k: 0.0105,
    description: "Superior reasoning and complex text detection.",
  },
  {
    id: "gemini-2.0-flash-exp",
    name: "Gemini 2.0 Flash (Exp)",
    inputCostPer1k: 0.0,
    outputCostPer1k: 0.0,
    description: "Latest experimental model. Extremely fast.",
  },
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    inputCostPer1k: 0.3,
    outputCostPer1k: 2.5,
    description: "Latest model. Extremely fast.",
  },
  {
    id: "gemini-3-flash-preview",
    name: "Gemini 3 Flash (Preview)",
    inputCostPer1k: 0.5,
    outputCostPer1k: 3,
    description: "Latest preview model. Extremely fast.",
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
  batchSize: number;
  batchDelay: number;
  useCustomApiKey?: boolean;
  customApiKey?: string;
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
