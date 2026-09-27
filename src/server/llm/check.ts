import { KeyCheck, keyHint, ProviderCheck } from "@/lib/aiUsage";
import { AiProviderConfig } from "@/types";
import { providerBaseUrl, providerKeys } from "./settings";

/**
 * Checks a provider's keys without spending tokens: lists the models the key
 * can use and, where the provider has an account endpoint, reads credits and
 * free quotas (OpenRouter /key, DeepSeek /user/balance).
 */

const TIMEOUT_MS = 12_000;
const MAX_MODELS = 400;

const getJson = async (url: string, headers: Record<string, string> = {}) => {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  return { status: response.status, ok: response.ok, body, text };
};

const errorText = (body: unknown, fallback: string) => {
  const error = (body as { error?: { message?: string } | string })?.error;
  const message = typeof error === "string" ? error : error?.message;
  return (message || fallback).slice(0, 300);
};

const rejected = (status: number) => status === 401 || status === 403;

const checkGemini = async (key: string): Promise<KeyCheck> => {
  const hint = keyHint(key);
  const result = await getJson(
    `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&key=${encodeURIComponent(key)}`,
  );
  if (!result.ok) {
    const invalid = rejected(result.status) || /API key not valid|API_KEY_INVALID/i.test(result.text);
    return { keyHint: hint, ok: invalid ? false : null, message: errorText(result.body, `HTTP ${result.status}`) };
  }
  const models = ((result.body as { models?: { name?: string }[] })?.models || [])
    .map((model) => (model.name || "").replace(/^models\//, ""))
    .filter(Boolean);
  return { keyHint: hint, ok: true, message: "Key accepted", models: models.slice(0, MAX_MODELS) };
};

const checkOpenAiCompatible = async (provider: AiProviderConfig, key: string): Promise<KeyCheck> => {
  const hint = keyHint(key);
  const base = (providerBaseUrl(provider) || "").replace(/\/+$/, "");
  if (!base) return { keyHint: hint, ok: null, message: "No base URL" };
  const auth = { Authorization: `Bearer ${key}` };
  const check: KeyCheck = { keyHint: hint, ok: null, message: "" };

  const listed = await getJson(`${base}/models`, auth).catch((error: Error) => ({
    status: 0,
    ok: false,
    body: null,
    text: error.message,
  }));
  if (listed.ok) {
    const data = (listed.body as { data?: { id?: string }[] })?.data || [];
    check.ok = true;
    check.message = "Key accepted";
    check.models = data
      .map((model) => model.id || "")
      .filter(Boolean)
      .slice(0, MAX_MODELS);
  } else if (rejected(listed.status)) {
    check.ok = false;
    check.message = errorText(listed.body, "The provider rejected this key");
  } else {
    // Some providers have no model list; that says nothing about the key.
    check.message =
      listed.status === 0
        ? `Could not reach the provider: ${listed.text}`
        : `Model list unavailable (HTTP ${listed.status})`;
  }

  if (provider.preset === "openrouter") {
    const account = await getJson("https://openrouter.ai/api/v1/key", auth).catch(() => null);
    const data = (
      account?.body as {
        data?: {
          usage?: number;
          limit?: number | null;
          is_free_tier?: boolean;
          free_model_daily_requests?: { used?: number; limit?: number; remaining?: number };
        };
      }
    )?.data;
    if (account?.ok && data) {
      // OpenRouter's /models is public, so /key is what proves the key.
      check.ok = true;
      check.message = "Key accepted";
      const daily = data.free_model_daily_requests;
      check.account = {
        freeTier: data.is_free_tier,
        creditsUsed: data.usage,
        creditsLimit: data.limit ?? null,
        freeDaily:
          daily && typeof daily.limit === "number"
            ? {
                used: daily.used || 0,
                limit: daily.limit,
                remaining: daily.remaining ?? daily.limit - (daily.used || 0),
              }
            : undefined,
      };
    } else if (account && rejected(account.status)) {
      check.ok = false;
      check.message = errorText(account.body, "The provider rejected this key");
      check.models = undefined; // the public model list says nothing about this key
    }
  }

  if (provider.preset === "deepseek") {
    const balance = await getJson(`${base.replace(/\/v1$/, "")}/user/balance`, auth).catch(() => null);
    const infos = (balance?.body as { balance_infos?: { currency?: string; total_balance?: string }[] })?.balance_infos;
    if (balance?.ok && infos?.length) {
      check.account = {
        balance: infos.map((info) => `${info.total_balance} ${info.currency}`).join(", "),
      };
    }
  }
  return check;
};

export const checkProvider = async (provider: AiProviderConfig): Promise<ProviderCheck> => {
  const keys = providerKeys(provider).slice(0, 10);
  const results = await Promise.all(
    keys.map((key) =>
      (provider.kind === "gemini" ? checkGemini(key) : checkOpenAiCompatible(provider, key)).catch(
        (error: Error): KeyCheck => ({ keyHint: keyHint(key), ok: null, message: error.message || "Check failed" }),
      ),
    ),
  );
  return { providerId: provider.id, checkedAt: new Date().toISOString(), keys: results };
};
