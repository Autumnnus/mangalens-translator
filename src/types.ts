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

export interface TranslationSettings {
  targetLanguage: string;
  fontSize: number;
  fontColor: string;
  backgroundColor: string;
  strokeColor: string;
  customInstructions?: string;
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
