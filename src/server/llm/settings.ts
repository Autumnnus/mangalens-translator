import { catalogModel, DEFAULT_READER_MODEL, presetById } from "@/lib/aiCatalog";
import { AiModelChoice, AiProviderConfig, AiSettings, TranslationSettings } from "@/types";

/**
 * Resolves the AI configuration of a user. Accounts saved before the
 * provider-neutral settings existed only had Gemini keys (`namedApiKeys`,
 * `customApiKeyPool`, the server key) and a Gemini model id; those are mapped
 * onto one Gemini provider so old accounts keep working unchanged.
 */

export const SYSTEM_PROVIDER_ID = "system-gemini";

const unique = (values: (string | undefined)[]) =>
  [...new Set(values.map((value) => value?.trim()).filter((value): value is string => !!value))];

const systemGeminiKey = () =>
  (process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || "").trim();

const legacyGeminiProvider = (stored: Partial<TranslationSettings>): AiProviderConfig => {
  const named = unique((stored.namedApiKeys || []).filter((item) => item.enabled !== false).map((item) => item.key));
  const pooled = unique((stored.customApiKeyPool || "").split(/[\n,]/g));
  const keys = stored.useCustomApiKey ? (named.length ? named : pooled) : [];
  return {
    id: keys.length ? "legacy-gemini" : SYSTEM_PROVIDER_ID,
    name: keys.length ? "Gemini" : "Gemini (server key)",
    preset: "gemini",
    kind: "gemini",
    apiKeys: keys,
  };
};

export const resolveAiSettings = (stored: Partial<TranslationSettings> = {}): AiSettings => {
  const saved = stored.ai;
  const providers = saved?.providers?.length ? saved.providers : [legacyGeminiProvider(stored)];
  const firstVision = providers[0];
  const legacyModel =
    stored.model && catalogModel(stored.model) ? stored.model : DEFAULT_READER_MODEL;
  const fallbackReader = (): AiModelChoice => ({ providerId: firstVision.id, model: legacyModel });
  const valid = (choice?: AiModelChoice) =>
    !!choice && !!choice.model?.trim() && providers.some((provider) => provider.id === choice.providerId);

  const reader = valid(saved?.reader) ? saved!.reader : fallbackReader();
  const translator = valid(saved?.translator) ? saved!.translator : reader;
  let readerFallback = valid(saved?.readerFallback) ? saved!.readerFallback : undefined;
  if (!saved && stored.enableQualityFallback !== false && stored.fallbackModel && catalogModel(stored.fallbackModel)) {
    readerFallback =
      stored.fallbackModel !== reader.model
        ? { providerId: reader.providerId, model: stored.fallbackModel }
        : undefined;
  }
  return { providers, reader, translator, readerFallback };
};

/** API keys of a provider; the server's own Gemini key backs the system provider. */
export const providerKeys = (provider: AiProviderConfig) => {
  const keys = unique(provider.apiKeys || []);
  if (keys.length === 0 && (provider.id === SYSTEM_PROVIDER_ID || provider.kind === "gemini")) {
    const system = systemGeminiKey();
    return system ? [system] : [];
  }
  return keys;
};

export const providerBaseUrl = (provider: AiProviderConfig) =>
  provider.kind === "openai" ? provider.baseUrl || presetById(provider.preset)?.baseUrl : undefined;

/** Human-readable reason the settings cannot run a page, or null. */
export const aiSettingsProblem = (ai: AiSettings) => {
  const reader = ai.providers.find((provider) => provider.id === ai.reader.providerId);
  const translator = ai.providers.find((provider) => provider.id === ai.translator.providerId);
  if (!reader || providerKeys(reader).length === 0) return "The reading model's provider has no API key.";
  if (!translator || providerKeys(translator).length === 0) {
    return "The translation model's provider has no API key.";
  }
  for (const provider of [reader, translator]) {
    if (provider.kind === "openai" && !providerBaseUrl(provider)?.trim()) {
      return `${provider.name} needs a base URL.`;
    }
  }
  if (!ai.reader.model.trim() || !ai.translator.model.trim()) return "Pick a model for reading and translation.";
  return null;
};
