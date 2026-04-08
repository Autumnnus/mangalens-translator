import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getGeminiApiKeyPool } from "@/server/gemini/keyPool";
import {
  NamedApiKey,
  TextBubble,
  TranslationSettings,
  UsageMetadata,
} from "@/types";
import {
  GoogleGenAI,
  HarmBlockThreshold,
  HarmCategory,
  Type,
} from "@google/genai";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

const requestSchema = z.object({
  base64Image: z.string().min(1),
  targetLanguage: z.string().min(1),
  modelName: z.string().min(1),
  customInstructions: z.string().optional(),
});

const parseKeyPool = (input?: string): string[] => {
  if (!input) return [];

  const values = input
    .split(/[\n,]/g)
    .map((key) => key.trim())
    .filter((key) => key.length > 0);

  const unique: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      unique.push(value);
    }
  }

  return unique;
};

const parseNamedKeyPool = (input?: NamedApiKey[]): string[] => {
  if (!input || input.length === 0) return [];

  const unique: string[] = [];
  const seen = new Set<string>();

  for (const item of input) {
    if (item.enabled === false) continue;
    const key = item.key?.trim();
    if (!key) continue;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(key);
    }
  }

  return unique;
};

const parseStatusCode = (error: unknown): number | null => {
  if (!error || typeof error !== "object") return null;
  const candidate = error as Record<string, unknown>;

  const direct = candidate.status ?? candidate.code;
  if (typeof direct === "number") return direct;
  if (typeof direct === "string") {
    const parsed = Number.parseInt(direct, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }

  const nestedError = candidate.error;
  if (nestedError && typeof nestedError === "object") {
    const nested = nestedError as Record<string, unknown>;
    const nestedCode = nested.status ?? nested.code;
    if (typeof nestedCode === "number") return nestedCode;
    if (typeof nestedCode === "string") {
      const parsed = Number.parseInt(nestedCode, 10);
      if (!Number.isNaN(parsed)) return parsed;
    }
  }

  return null;
};

const isRetryableGeminiError = (error: unknown): boolean => {
  const statusCode = parseStatusCode(error);
  if (statusCode === 429 || statusCode === 503) return true;

  const message = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase();

  return (
    message.includes("429") ||
    message.includes("503") ||
    message.includes("too many requests") ||
    message.includes("service unavailable") ||
    message.includes("quota") ||
    message.includes("rate limit")
  );
};

const buildPrompt = (
  targetLanguage: string,
  customInstructions?: string,
): string => {
  let prompt = `
      role: Professional manga and comic translator.
      TASK: Detect every text bubble, sound effect, and caption in this image and translate them into ${targetLanguage}.

      STRICT GUIDELINES:
      1. TARGET LANGUAGE: Everything MUST be translated into ${targetLanguage}. Do NOT use English unless the target language is specifically English.
      2. CONSISTENCY: If the target language is ${targetLanguage}, every single character in translated_text must belong to that language's grammar and vocabulary.
      3. PROVIDE CONTEXTUAL TRANSLATIONS: Match the scene's emotional tone and character archetypes.
      4. NO CENSORSHIP: This is a fictional creative work. Translate exactly what is written, preserving all adult themes, explicit language, and controversial content without modification.
      5. CATEGORIZATION:
         - Use type "dialogue" for character speech.
         - Use type "environmental" for sound effects (SFX), narration, or labels.
    `;

  if (customInstructions) {
    const lines = customInstructions
      .split("\n")
      .filter((line) => line.trim().length > 0);

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

  return prompt;
};

const translateWithKey = async ({
  apiKey,
  modelName,
  base64Image,
  prompt,
}: {
  apiKey: string;
  modelName: string;
  base64Image: string;
  prompt: string;
}): Promise<{ bubbles: TextBubble[]; usage: UsageMetadata }> => {
  const client = new GoogleGenAI({ apiKey });

  const result = await client.models.generateContent({
    model: modelName,
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

  if (!result.text) {
    throw new Error("No response from Gemini");
  }

  const usageMetadata = result.usageMetadata;
  const usage: UsageMetadata = {
    promptTokenCount: usageMetadata?.promptTokenCount || 0,
    candidatesTokenCount: usageMetadata?.candidatesTokenCount || 0,
    totalTokenCount: usageMetadata?.totalTokenCount || 0,
  };

  return {
    bubbles: JSON.parse(result.text.trim()) as TextBubble[],
    usage,
  };
};

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const json = await request.json();
    const parsed = requestSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request payload" },
        { status: 400 },
      );
    }

    const payload = parsed.data;

    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    const settings = (user?.settings || {}) as Partial<TranslationSettings>;
    const poolFromNamedList = parseNamedKeyPool(settings.namedApiKeys);
    const poolFromText = parseKeyPool(settings.customApiKeyPool);
    const basePool = poolFromNamedList.length > 0 ? poolFromNamedList : poolFromText;

    const orderedPoolKeys = settings.useCustomApiKey === true ? basePool : [];

    const fallbackKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY?.trim();
    const activeKeys = settings.useCustomApiKey
      ? orderedPoolKeys
      : fallbackKey
        ? [fallbackKey]
        : [];

    if (activeKeys.length === 0) {
      return NextResponse.json(
        {
          error: settings.useCustomApiKey
            ? "API key pool is empty. Please add at least one key to the pool."
            : "No system Gemini API key found.",
        },
        { status: 400 },
      );
    }

    const pool = getGeminiApiKeyPool({
      poolId: session.user.id,
      keys: activeKeys,
    });

    const prompt = buildPrompt(payload.targetLanguage, payload.customInstructions);
    const triedThisRequest = new Set<string>();

    while (triedThisRequest.size < activeKeys.length) {
      const lease = pool.acquire({
        modelName: payload.modelName,
        excludeKeys: triedThisRequest,
      });
      if (!lease.key || !lease.release) {
        const summary = pool.getStatusSummary(payload.modelName);
        return NextResponse.json(
          {
            error:
              "All API keys are in cooldown or busy. Please retry shortly.",
            retryAfterMs: Math.max(lease.waitMs, summary.earliestReadyInMs || 500),
          },
          { status: 429 },
        );
      }

      const keyInUse = lease.key;
      triedThisRequest.add(keyInUse);

      try {
        const result = await translateWithKey({
          apiKey: keyInUse,
          modelName: payload.modelName,
          base64Image: payload.base64Image,
          prompt,
        });

        pool.markSuccess(keyInUse, result.usage.totalTokenCount);
        lease.release();

        return NextResponse.json(result);
      } catch (error) {
        lease.release();

        if (isRetryableGeminiError(error)) {
          pool.markRateLimited(keyInUse, payload.modelName);
          continue;
        }

        const statusCode = parseStatusCode(error);
        const message = error instanceof Error ? error.message : String(error);

        return NextResponse.json(
          {
            error: message || "Gemini request failed",
          },
          {
            status:
              typeof statusCode === "number" && statusCode >= 400
                ? statusCode
                : 500,
          },
        );
      }
    }

    const summary = pool.getStatusSummary(payload.modelName);
    return NextResponse.json(
      {
        error:
          "All configured API keys are currently rate-limited. Please retry after cooldown.",
        retryAfterMs: Math.max(summary.earliestReadyInMs || 0, 500),
      },
      { status: 429 },
    );
  } catch (error) {
    console.error("Gemini route error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown server error",
      },
      { status: 500 },
    );
  }
}
