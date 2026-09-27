import { parseOpenAiQuota, parseRateLimitHeaders, parseResetMs } from "./limits";
import { ModelCallError, ModelRequest, ModelResponse, parseJsonAnswer, ProviderEndpoint } from "./types";

/**
 * Any OpenAI-compatible chat completions API: OpenAI, OpenRouter, DeepSeek,
 * Zhipu GLM, Alibaba Qwen (DashScope compatible mode), local servers.
 * Structured output is requested as a JSON object with the schema in the
 * prompt, the lowest common denominator these providers all support.
 */
export const callOpenAiCompatible = async (
  endpoint: ProviderEndpoint,
  request: ModelRequest,
): Promise<ModelResponse> => {
  const base = (endpoint.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  const schemaNote = `Answer with a single JSON object that matches this JSON Schema, and nothing else:\n${JSON.stringify(request.schema)}`;
  const content = request.parts.map((part) =>
    part.type === "text"
      ? { type: "text", text: part.text }
      : { type: "image_url", image_url: { url: `data:${part.mimeType};base64,${part.data}` } },
  );
  const body = {
    model: endpoint.model,
    messages: [
      { role: "system", content: [request.system, schemaNote].filter(Boolean).join("\n\n") },
      { role: "user", content },
    ],
    temperature: request.temperature ?? 0.1,
    max_tokens: request.maxOutputTokens ?? 8192,
    response_format: { type: "json_object" },
  };

  let response: Response;
  try {
    response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${endpoint.apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180_000),
    });
  } catch (error) {
    throw new ModelCallError(error instanceof Error ? error.message : String(error));
  }
  const raw = await response.text();
  const limits = parseRateLimitHeaders(response.headers, endpoint.preset);
  if (!response.ok) {
    const retryHeader = response.headers.get("retry-after");
    const retryAfterMs = retryHeader ? parseResetMs(retryHeader) : undefined;
    let message = raw.slice(0, 500);
    try {
      const parsed = JSON.parse(raw) as { error?: { message?: string } | string };
      message = typeof parsed.error === "string" ? parsed.error : parsed.error?.message || message;
    } catch {
      // keep raw text
    }
    const quota = parseOpenAiQuota(response.status, `${message} ${raw.slice(0, 1000)}`, endpoint.preset, limits, retryAfterMs);
    throw new ModelCallError(`${response.status}: ${message}`, {
      status: response.status,
      retryAfterMs: retryAfterMs && retryAfterMs > 0 ? retryAfterMs : undefined,
      quota,
      limits,
    });
  }
  const data = JSON.parse(raw) as {
    choices?: { message?: { content?: string | { text?: string }[] }; finish_reason?: string }[];
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      completion_tokens_details?: { reasoning_tokens?: number };
    };
  };
  const reasoning = data.usage?.completion_tokens_details?.reasoning_tokens || 0;
  const usage = {
    inputTokens: data.usage?.prompt_tokens || 0,
    // completion_tokens already includes reasoning tokens.
    outputTokens: Math.max(0, (data.usage?.completion_tokens || 0) - reasoning),
    reasoningTokens: reasoning,
  };
  const choice = data.choices?.[0];
  const message = choice?.message?.content;
  const text = Array.isArray(message) ? message.map((item) => item.text || "").join("") : message || "";
  if (!text.trim()) {
    throw new ModelCallError(
      choice?.finish_reason === "content_filter"
        ? "The provider refused this page (content filter)"
        : "The model returned an empty answer",
      { usage, limits, blocked: choice?.finish_reason === "content_filter" },
    );
  }
  try {
    return { json: parseJsonAnswer(text), usage, limits };
  } catch (error) {
    throw new ModelCallError(error instanceof Error ? error.message : String(error), { usage, limits });
  }
};
