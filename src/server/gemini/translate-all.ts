"use server";

import { db } from "@/db";
import { images, users } from "@/db/schema";
import { uploadObject } from "@/lib/storage";
import { getGeminiApiKeyPool } from "@/server/gemini/keyPool";
import { NamedApiKey, TranslationSettings, UsageMetadata } from "@/types";
import {
  GoogleGenAI,
  HarmBlockThreshold,
  HarmCategory,
  Type,
} from "@google/genai";
import { eq, asc } from "drizzle-orm";

type Bubble = {
  box_2d: [number, number, number, number];
  translated_text: string;
};

const parseKeyPool = (input?: string): string[] =>
  (input || "")
    .split(/[\n,]/g)
    .map((key) => key.trim())
    .filter(Boolean);

const parseNamedKeyPool = (input?: NamedApiKey[]): string[] =>
  (input || [])
    .filter((item) => item.enabled !== false)
    .map((item) => item.key?.trim())
    .filter((key): key is string => !!key);

const buildPrompt = (targetLanguage: string, customInstructions?: string) => {
  let prompt = `
role: Professional manga and comic translator.
TASK: Detect every text bubble, sound effect, and caption in this image and translate them into ${targetLanguage}.
OUTPUT: Return a JSON array with box_2d, original_text, translated_text, and type.
`;

  if (customInstructions) {
    prompt += `\n${customInstructions}\n`;
  }

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
}) => {
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
      responseSchema: {
        type: Type.ARRAY,
      },
    },
  });

  return {
    bubbles: JSON.parse(result.text || "[]"),
    usage: {
      promptTokenCount: result.usageMetadata?.promptTokenCount || 0,
      candidatesTokenCount: result.usageMetadata?.candidatesTokenCount || 0,
      totalTokenCount: result.usageMetadata?.totalTokenCount || 0,
    } as UsageMetadata,
  };
};

const toBase64 = async (url: string) => {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer).toString("base64");
};

const createTranslatedSvg = (imageUrl: string, bubbles: Bubble[]) => {
  const bubbleMarkup = bubbles
    .map((bubble) => {
      const [ymin, xmin, ymax, xmax] = bubble.box_2d;
      const x = xmin;
      const y = ymin;
      const width = xmax - xmin;
      const height = ymax - ymin;
      const textX = x + width / 2;
      const textY = y + height / 2;
      const escaped = String(bubble.translated_text || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

      return `
        <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="18" ry="18" fill="#ffffff" opacity="0.92" />
        <text x="${textX}" y="${textY}" fill="#111111" font-size="32" font-family="Arial, sans-serif" font-weight="700" text-anchor="middle" dominant-baseline="middle">${escaped}</text>
      `;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000">
  <image href="${imageUrl}" x="0" y="0" width="1000" height="1000" preserveAspectRatio="none" />
  ${bubbleMarkup}
</svg>`;
};

export async function processTranslateAll(seriesId: string, userId: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  const settings = (user?.settings || {}) as Partial<TranslationSettings>;
  const poolFromNamedList = parseNamedKeyPool(settings.namedApiKeys);
  const poolFromText = parseKeyPool(settings.customApiKeyPool);
  const basePool = poolFromNamedList.length > 0 ? poolFromNamedList : poolFromText;
  const fallbackKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY?.trim();
  const activeKeys = settings.useCustomApiKey ? basePool : fallbackKey ? [fallbackKey] : [];
  if (activeKeys.length === 0) {
    throw new Error("No Gemini API key available");
  }

  const pool = getGeminiApiKeyPool({ poolId: userId, keys: activeKeys });
  const prompt = buildPrompt(
    settings.targetLanguage || "English",
    settings.customInstructions,
  );

  const imageRows = await db.query.images.findMany({
    where: eq(images.seriesId, seriesId),
    orderBy: asc(images.sequenceNumber),
  });

  for (const img of imageRows) {
    await db
      .update(images)
      .set({ status: "processing", updatedAt: new Date() })
      .where(eq(images.id, img.id));

    const lease = pool.acquire({
      modelName: settings.model || "gemini-2.5-flash",
      excludeKeys: new Set(),
    });

    if (!lease.key || !lease.release) throw new Error("No Gemini key acquired");

    try {
      const imageUrl =
        `${process.env.NEXT_PUBLIC_MINIO_URL || "http://localhost:9000/mangalens"}/${img.originalKey}`;
      const base64 = await toBase64(imageUrl);
      const result = await translateWithKey({
        apiKey: lease.key,
        modelName: settings.model || "gemini-2.5-flash",
        base64Image: base64,
        prompt,
      });
      pool.markSuccess(lease.key, result.usage.totalTokenCount);

      const svg = createTranslatedSvg(imageUrl, result.bubbles);
      const translatedKey = `${seriesId}/translated_${img.id}.svg`;
      await uploadObject(translatedKey, svg, "image/svg+xml");

      await db
        .update(images)
        .set({
          translatedKey,
          status: "completed",
          bubbles: result.bubbles,
          usage: result.usage,
          updatedAt: new Date(),
        })
        .where(eq(images.id, img.id));
    } catch (error) {
      pool.markRateLimited(lease.key, settings.model || "gemini-2.5-flash");
      lease.release();
      await db
        .update(images)
        .set({ status: "error", updatedAt: new Date() })
        .where(eq(images.id, img.id));
      console.error("Translate-all job failed for image", img.id, error);
      continue;
    }
    lease.release();
  }
}
