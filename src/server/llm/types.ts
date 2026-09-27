import { LimitWindow, QuotaHit } from "@/lib/aiUsage";

/**
 * Provider-neutral model calls. The pipeline only speaks this interface; each
 * provider adapter translates it to its own wire format.
 */

export type ProviderKind = "gemini" | "openai";

export interface ImagePart {
  type: "image";
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  /** Base64 without a data: prefix. */
  data: string;
}

export interface TextPart {
  type: "text";
  text: string;
}

export type MessagePart = TextPart | ImagePart;

export interface ModelRequest {
  system?: string;
  parts: MessagePart[];
  /** JSON Schema of the expected answer; adapters ask for JSON output. */
  schema: Record<string, unknown>;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  /** Reasoning tokens billed as output, when the provider reports them. */
  reasoningTokens: number;
}

export interface ModelResponse {
  /** Parsed JSON answer. */
  json: unknown;
  usage: ModelUsage;
  /** Rate-limit windows the provider reported with the answer. */
  limits?: LimitWindow[];
}

export interface ProviderEndpoint {
  kind: ProviderKind;
  apiKey: string;
  /** OpenAI-compatible providers only. */
  baseUrl?: string;
  model: string;
  /** Catalog preset, for provider-specific header meanings. */
  preset: string;
}

export class ModelCallError extends Error {
  status?: number;
  retryAfterMs?: number;
  usage?: ModelUsage;
  /** The provider refused the content (safety filters). */
  blocked?: boolean;
  /** A quota the provider said was exceeded. */
  quota?: QuotaHit;
  limits?: LimitWindow[];
  constructor(message: string, init: Partial<ModelCallError> = {}) {
    super(message);
    this.name = "ModelCallError";
    Object.assign(this, init);
  }
}

/** Rate limits, overload and transient server errors: worth another try. */
export const isRetryable = (error: unknown) => {
  // A daily quota does not come back within any sensible retry window.
  if ((error as ModelCallError)?.quota?.scope === "day") return false;
  const status = (error as ModelCallError)?.status;
  if (status === 408 || status === 409 || status === 429 || (status !== undefined && status >= 500)) {
    return true;
  }
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return /rate limit|too many requests|overloaded|unavailable|timeout|econnreset|fetch failed/.test(message);
};

/** Parses a JSON answer, tolerating markdown fences and leading prose. */
export const parseJsonAnswer = (text: string): unknown => {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const body = fenced ? fenced[1] : trimmed;
    const start = body.search(/[[{]/);
    const end = Math.max(body.lastIndexOf("}"), body.lastIndexOf("]"));
    if (start >= 0 && end > start) return JSON.parse(body.slice(start, end + 1));
    throw new Error("The model did not return JSON");
  }
};
