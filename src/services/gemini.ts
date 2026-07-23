import {
  LocalOcrJobSummary,
  TextBubble,
  UsageMetadata,
} from "../types";

export type GeminiTranslationResult =
  | { status: "completed"; bubbles: TextBubble[]; usage: UsageMetadata }
  | { status: "local_ocr_pending"; job: LocalOcrJobSummary };

export class GeminiService {
  async translateImage(
    base64Image: string,
    mimeType: string,
    targetLanguage: string,
    customInstructions?: string,
    modelName: string = "gemini-2.5-flash-lite",
    fallbackModelName: string = "gemini-2.5-flash",
    enableQualityFallback: boolean = true,
    seriesId?: string,
    imageId?: string,
    translationPipeline: "auto" | "gemini_vision" | "local_ocr" = "auto",
  ): Promise<GeminiTranslationResult> {
    try {
      const response = await fetch("/api/gemini/translate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          base64Image,
          mimeType,
          targetLanguage,
          customInstructions,
          modelName,
          fallbackModelName,
          enableQualityFallback,
          seriesId,
          imageId,
          translationPipeline,
        }),
      });

      const data = (await response.json()) as
        | { error?: string; status?: number }
        | { localOcrJob: LocalOcrJobSummary }
        | { bubbles: TextBubble[]; usage: UsageMetadata };

      if (!response.ok) {
        const error = new Error(
          "error" in data && data.error
            ? data.error
            : "Gemini request failed on server",
        ) as Error & { status?: number };
        error.status = response.status;
        throw error;
      }

      if (response.status === 202 && "localOcrJob" in data) {
        return { status: "local_ocr_pending", job: data.localOcrJob };
      }

      if (!("bubbles" in data) || !("usage" in data)) {
        throw new Error("Invalid Gemini response format from server");
      }

      return { status: "completed", ...data };
    } catch (error: unknown) {
      console.error("Gemini Translation Error:", error);
      throw error instanceof Error ? error : new Error(String(error));
    }
  }
}
