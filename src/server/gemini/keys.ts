import { NamedApiKey, TranslationSettings } from "@/types";

const unique = (values: string[]) => [...new Set(values.filter(Boolean))];

export const parseGeminiKeyPool = (input?: string) =>
  unique(
    (input || "")
      .split(/[\n,]/g)
      .map((key) => key.trim())
      .filter(Boolean),
  );

export const parseNamedGeminiKeyPool = (input?: NamedApiKey[]) =>
  unique(
    (input || [])
      .filter((item) => item.enabled !== false)
      .map((item) => item.key?.trim())
      .filter((key): key is string => !!key),
  );

export const resolveActiveGeminiKeys = (
  settings: Partial<TranslationSettings>,
) => {
  const namedPool = parseNamedGeminiKeyPool(settings.namedApiKeys);
  const textPool = parseGeminiKeyPool(settings.customApiKeyPool);
  const customPool = namedPool.length > 0 ? namedPool : textPool;
  const systemKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY?.trim();

  return settings.useCustomApiKey
    ? customPool
    : systemKey
      ? [systemKey]
      : [];
};

export const parseGeminiStatusCode = (error: unknown): number | null => {
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

export const isRetryableGeminiError = (error: unknown) => {
  const statusCode = parseGeminiStatusCode(error);
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

