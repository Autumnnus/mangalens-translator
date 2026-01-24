import {
  GoogleGenAI,
  HarmBlockThreshold,
  HarmCategory,
  Type,
} from "@google/genai";
import { TextBubble, UsageMetadata } from "../types";

export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "NEXT_PUBLIC_GEMINI_API_KEY is not defined. Please add it to your .env.local file.",
      );
    }
    this.ai = new GoogleGenAI({ apiKey });
  }

  async translateImage(
    base64Image: string,
    targetLanguage: string,
    customInstructions?: string,
  ): Promise<{ bubbles: TextBubble[]; usage: UsageMetadata }> {
    let prompt = `
      role: Professional manga and comic translator.
      TASK: Detect every text bubble, sound effect, and caption in this image and translate them into ${targetLanguage}.
      
      STRICT GUIDELINES:
      1. TARGET LANGUAGE: Everything MUST be translated into ${targetLanguage}. Do NOT use English unless the target language is specifically English. 
      2. CONSISTENCY: If the target language is ${targetLanguage}, every single character in translated_text must belong to that language's grammar and vocabulary.
      3. PROVIDE CONTEXTUAL TRANSLATIONS: Match the scene's emotional tone and character archetypes.
      4. NO CENSORSHIP: Translate exactly what is written, preserving intent, intensity, and any adult or controversial themes.
      5. CATEGORIZATION: 
         - Use type "dialogue" for character speech.
         - Use type "environmental" for sound effects (SFX), narration, or labels.
    `;

    if (customInstructions) {
      const lines = customInstructions
        .split("\n")
        .filter((l) => l.trim().length > 0);
      lines.forEach((line, index) => {
        prompt += `      ${index + 6}. ${line.trim()}\n`;
      });
    }

    prompt += `
      OUTPUT: Return a JSON array of objects with:
      - box_2d: [ymin, xmin, ymax, xmax] (0-1000). CRITICAL: Provide the bounding box of the text container (the bubble). It must be precise and follow the inner edges of the bubble/text area.
      - original_text: Text from the image.
      - translated_text: Translated text in ${targetLanguage}.
      - type: "dialogue" or "environmental".

      IMPORTANT: TRANSLATE EVERYTHING TO ${targetLanguage.toUpperCase()}. NO EXCEPTIONS.
    `;

    try {
      const result = await this.ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: base64Image,
              },
            },
          ],
        },
        config: {
          responseMimeType: "application/json",
          safetySettings: [
            {
              category: HarmCategory.HARM_CATEGORY_HARASSMENT,
              threshold: HarmBlockThreshold.BLOCK_NONE,
            },
            {
              category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
              threshold: HarmBlockThreshold.BLOCK_NONE,
            },
            {
              category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
              threshold: HarmBlockThreshold.BLOCK_NONE,
            },
            {
              category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
              threshold: HarmBlockThreshold.BLOCK_NONE,
            },
          ],
          temperature: 2,
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                box_2d: {
                  type: Type.ARRAY,
                  items: { type: Type.INTEGER },
                },
                original_text: { type: Type.STRING },
                translated_text: { type: Type.STRING },
                type: {
                  type: Type.STRING,
                  enum: ["dialogue", "environmental"],
                },
              },
              required: ["box_2d", "original_text", "translated_text", "type"],
            },
          },
        },
      });

      const text = result.text;
      const usageMetadata = result.usageMetadata;
      const usage: UsageMetadata = {
        promptTokenCount: usageMetadata?.promptTokenCount || 0,
        candidatesTokenCount: usageMetadata?.candidatesTokenCount || 0,
        totalTokenCount: usageMetadata?.totalTokenCount || 0,
      };

      if (!text) throw new Error("No response from Gemini");

      return {
        bubbles: JSON.parse(text.trim()) as TextBubble[],
        usage: usage,
      };
    } catch (error: unknown) {
      console.error("Gemini Translation Error:", error);
      throw error instanceof Error ? error : new Error(String(error));
    }
  }
}
