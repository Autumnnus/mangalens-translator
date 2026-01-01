export interface TextBubble {
  box_2d: [number, number, number, number]; // [ymin, xmin, ymax, xmax] 0-1000
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
  usage?: UsageMetadata;
  cost?: number; // Calculated USD cost
}

export interface TranslationSettings {
  targetLanguage: string;
  fontSize: number;
  fontColor: string;
  backgroundColor: string;
  strokeColor: string; // Added for white outline
}

export interface ImagePair {
  id: string;
  title: string;
  sourceUrl: string;
  convertedUrl: string;
  createdAt: number;
}

export interface Series {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  images: ProcessedImage[];
  createdAt: number;
  updatedAt: number;
}

export type ViewMode = "slider" | "toggle" | "side-by-side";
