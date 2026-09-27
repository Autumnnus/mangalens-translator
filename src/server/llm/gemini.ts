import { GoogleGenAI, HarmBlockThreshold, HarmCategory, ThinkingLevel } from "@google/genai";
import { parseGeminiQuota } from "./limits";
import { ModelCallError, ModelRequest, ModelResponse, parseJsonAnswer, ProviderEndpoint } from "./types";

const SAFETY_SETTINGS = [
  HarmCategory.HARM_CATEGORY_HARASSMENT,
  HarmCategory.HARM_CATEGORY_HATE_SPEECH,
  HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
  HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
].map((category) => ({ category, threshold: HarmBlockThreshold.BLOCK_NONE }));

/** Finish reasons that mean a filter stopped the answer, not the model. */
const BLOCKING_FINISH = new Set(["SAFETY", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "IMAGE_SAFETY", "IMAGE_PROHIBITED_CONTENT"]);

const statusOf = (error: unknown) => {
  const candidate = error as { status?: unknown; code?: unknown };
  const value = candidate?.status ?? candidate?.code;
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
};

/** Google Gemini through the official SDK. */
export const callGemini = async (
  endpoint: ProviderEndpoint,
  request: ModelRequest,
): Promise<ModelResponse> => {
  const client = new GoogleGenAI({ apiKey: endpoint.apiKey });
  let response;
  try {
    response = await client.models.generateContent({
      model: endpoint.model,
      contents: {
        parts: request.parts.map((part) =>
          part.type === "text"
            ? { text: part.text }
            : { inlineData: { mimeType: part.mimeType, data: part.data } },
        ),
      },
      config: {
        systemInstruction: request.system,
        responseMimeType: "application/json",
        responseJsonSchema: request.schema,
        temperature: request.temperature ?? 0.1,
        maxOutputTokens: request.maxOutputTokens ?? 8192,
        thinkingConfig: endpoint.model.startsWith("gemini-2")
          ? { thinkingBudget: 0 }
          : { thinkingLevel: ThinkingLevel.LOW },
        safetySettings: SAFETY_SETTINGS,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = statusOf(error);
    const quota = status === 429 || /RESOURCE_EXHAUSTED/.test(message) ? parseGeminiQuota(message) : undefined;
    throw new ModelCallError(message, {
      status,
      quota: quota ? { scope: quota.scope, limit: quota.limit, resetAt: quota.resetAt } : undefined,
      retryAfterMs: quota?.scope === "day" ? undefined : quota?.retryMs,
    });
  }
  const meta = response.usageMetadata;
  const usage = {
    inputTokens: meta?.promptTokenCount || 0,
    outputTokens: meta?.candidatesTokenCount || 0,
    reasoningTokens: meta?.thoughtsTokenCount || 0,
  };
  const blockReason = response.promptFeedback?.blockReason;
  const candidate = response.candidates?.[0];
  const finishReason = candidate?.finishReason;
  if (!response.text) {
    const blocked = !!blockReason || (!!finishReason && BLOCKING_FINISH.has(finishReason));
    // Say which filter fired: SAFETY and friends follow the settings above,
    // PROHIBITED_CONTENT and IMAGE_* are Google's own and cannot be turned off.
    const categories = [...(response.promptFeedback?.safetyRatings || []), ...(candidate?.safetyRatings || [])]
      .filter((rating) => rating.blocked)
      .map((rating) => String(rating.category || "").replace("HARM_CATEGORY_", ""));
    const reason = [
      blockReason ? `input ${blockReason}` : `answer ${finishReason}`,
      ...new Set(categories),
    ].join(", ");
    throw new ModelCallError(
      blocked ? `Gemini refused this page (safety filter: ${reason})` : "The model returned an empty answer",
      { usage, blocked },
    );
  }
  try {
    return { json: parseJsonAnswer(response.text), usage };
  } catch (error) {
    throw new ModelCallError(error instanceof Error ? error.message : String(error), { usage });
  }
};
