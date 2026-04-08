import { TextBubble, UsageMetadata } from "../types";

export class GeminiService {
  async translateImage(
    base64Image: string,
    targetLanguage: string,
    customInstructions?: string,
    modelName: string = "gemini-1.5-flash",
  ): Promise<{ bubbles: TextBubble[]; usage: UsageMetadata }> {
    try {
      const response = await fetch("/api/gemini/translate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          base64Image,
          targetLanguage,
          customInstructions,
          modelName,
        }),
      });

      const data = (await response.json()) as
        | { error?: string; status?: number }
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

      if (!("bubbles" in data) || !("usage" in data)) {
        throw new Error("Invalid Gemini response format from server");
      }

      return data;
    } catch (error: unknown) {
      console.error("Gemini Translation Error:", error);
      throw error instanceof Error ? error : new Error(String(error));
    }
  }
}
