import { GoogleGenAI, HarmBlockThreshold, HarmCategory, ThinkingLevel } from "@google/genai";
import { ModelCallError, ModelRequest, ModelResponse, parseJsonAnswer, ProviderEndpoint } from "./types";

const SAFETY_SETTINGS = [
  HarmCategory.HARM_CATEGORY_HARASSMENT,
  HarmCategory.HARM_CATEGORY_HATE_SPEECH,
  HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
  HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
].map((category) => ({ category, threshold: HarmBlockThreshold.BLOCK_NONE }));

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
    throw new ModelCallError(error instanceof Error ? error.message : String(error), {
      status: statusOf(error),
    });
  }
  const meta = response.usageMetadata;
  const usage = {
    inputTokens: meta?.promptTokenCount || 0,
    outputTokens: meta?.candidatesTokenCount || 0,
    reasoningTokens: meta?.thoughtsTokenCount || 0,
  };
  const blockReason = response.promptFeedback?.blockReason;
  const finishReason = response.candidates?.[0]?.finishReason;
  if (!response.text) {
    throw new ModelCallError(
      blockReason || finishReason === "SAFETY"
        ? "The provider refused this page (safety filter)"
        : "The model returned an empty answer",
      { usage, blocked: !!blockReason || finishReason === "SAFETY" },
    );
  }
  try {
    return { json: parseJsonAnswer(response.text), usage };
  } catch (error) {
    throw new ModelCallError(error instanceof Error ? error.message : String(error), { usage });
  }
};
