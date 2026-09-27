import {
  Button,
  Field,
  Input,
  Modal,
  SectionLabel,
  Select,
  Switch,
  Textarea,
} from "@/components/ui";
import { useAiUsage } from "@/hooks/useAiUsage";
import { presetById, PROVIDER_PRESETS, SetupRecipe } from "@/lib/aiCatalog";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useUIStore } from "@/stores/useUIStore";
import { Gauge, Plus } from "lucide-react";
import React, { useEffect, useState } from "react";
import ModelPicker from "./ai/ModelPicker";
import ProviderCard, { SYSTEM_PROVIDER_ID } from "./ai/ProviderCard";
import SetupRecipes from "./ai/SetupRecipes";
import { CapacityBanner } from "./ai/UsageModal";
import { AiModelChoice, AiProviderConfig, AiSettings, TranslationSettings } from "../types";

/* ----------------------------------------------------------------------------
   Account: password change
   --------------------------------------------------------------------------- */

const PasswordChangeForm = () => {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  const handleChangePassword = async () => {
    if (!password) return;
    if (password !== confirm) {
      setMessage({ text: "Passwords do not match.", type: "error" });
      return;
    }
    if (password.length < 6) {
      setMessage({
        text: "Password must be at least 6 characters.",
        type: "error",
      });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Failed to update password");

      setMessage({ text: "Password updated.", type: "success" });
      setPassword("");
      setConfirm("");
    } catch (err: unknown) {
      setMessage({
        text: err instanceof Error ? err.message : "Something went wrong.",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void handleChangePassword();
      }}
    >
      <Field label="New password">
        {({ id }) => (
          <Input
            id={id}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
      </Field>
      <Field label="Confirm password">
        {({ id }) => (
          <Input
            id={id}
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        )}
      </Field>
      {message && (
        <p
          role={message.type === "error" ? "alert" : "status"}
          className={`text-xs ${message.type === "success" ? "text-ok" : "text-shu"}`}
        >
          {message.text}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" variant="secondary" loading={loading} disabled={!password}>
          Update password
        </Button>
      </div>
    </form>
  );
};

/* ----------------------------------------------------------------------------
   Small layout helpers
   --------------------------------------------------------------------------- */

const Section: React.FC<{
  label: string;
  aside?: React.ReactNode;
  first?: boolean;
  children: React.ReactNode;
}> = ({ label, aside, first = false, children }) => (
  <section className={first ? "flex flex-col gap-3" : "flex flex-col gap-3 border-t border-line pt-4"}>
    <div className="flex min-h-7 items-center justify-between gap-3">
      <SectionLabel>{label}</SectionLabel>
      {aside && <div className="flex items-center gap-2">{aside}</div>}
    </div>
    {children}
  </section>
);

/* ----------------------------------------------------------------------------
   AI helpers
   --------------------------------------------------------------------------- */

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().slice(0, 12)
    : `p-${Date.now().toString(36)}`;

const providerFromPreset = (presetId: string, freeTier?: boolean): AiProviderConfig | null => {
  const preset = presetById(presetId);
  if (!preset) return null;
  return {
    id: newId(),
    name: preset.label,
    preset: preset.id,
    kind: preset.kind,
    baseUrl: preset.kind === "openai" ? preset.baseUrl : undefined,
    apiKeys: [],
    freeTier: freeTier || undefined,
  };
};

/**
 * Applies a ready-made setup: reuses a provider of each needed preset
 * (preferring one with keys) and adds the missing ones with empty keys.
 */
const applyRecipe = (ai: AiSettings, recipe: SetupRecipe) => {
  const providers = [...ai.providers];
  const added: string[] = [];
  const providerFor = (presetId: string) => {
    const candidates = providers.filter((provider) => provider.preset === presetId);
    const existing =
      candidates.find((provider) => provider.apiKeys.length > 0 || provider.id === SYSTEM_PROVIDER_ID) || candidates[0];
    if (existing) return existing.id;
    const created = providerFromPreset(presetId, recipe.free);
    if (!created) return providers[0].id;
    providers.push(created);
    added.push(created.name);
    return created.id;
  };
  const choice = (stage?: [string, string]): AiModelChoice | undefined =>
    stage ? { providerId: providerFor(stage[0]), model: stage[1] } : undefined;
  const next: AiSettings = {
    providers,
    reader: choice(recipe.reader)!,
    translator: choice(recipe.translator)!,
    readerFallback: choice(recipe.readerFallback),
    translatorFallback: choice(recipe.translatorFallback),
  };
  return { next, added };
};

/* ----------------------------------------------------------------------------
   Settings modal
   --------------------------------------------------------------------------- */

interface Props {
  isOpen: boolean;
  onClose: () => void;
  settings: TranslationSettings;
  onSettingsChange?: (settings: TranslationSettings) => void;
}

const TARGET_LANGUAGES = ["Turkish", "English", "Spanish", "Japanese", "French", "German"];

const SettingsModal: React.FC<Props> = ({ isOpen, onClose, settings }) => {
  const initializeSettings = useSettingsStore((state) => state.initializeSettings);
  const toggleUsageModal = useUIStore((state) => state.toggleUsageModal);
  const [local, setLocal] = useState<TranslationSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newPreset, setNewPreset] = useState("mistral");
  const { data: usage } = useAiUsage(isOpen);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setNotice(null);
    // Always edit the server's view: it carries the resolved providers.
    void fetch("/api/settings", { cache: "no-store", credentials: "same-origin" })
      .then((response) => (response.ok ? response.json() : null))
      .then((fresh: TranslationSettings | null) => setLocal(fresh || settings))
      .catch(() => setLocal(settings));
  }, [isOpen, settings]);

  const ai: AiSettings | undefined = local.ai;
  const setAi = (next: AiSettings) => setLocal((prev) => ({ ...prev, ai: next }));

  const limitFor = (choice?: AiModelChoice) =>
    choice
      ? usage?.limits.find((entry) => entry.providerId === choice.providerId && entry.model === choice.model)
      : undefined;

  const addProvider = () => {
    if (!ai) return;
    const provider = providerFromPreset(newPreset, !!presetById(newPreset)?.freeTier && newPreset !== "deepseek");
    if (!provider) return;
    setAi({ ...ai, providers: [...ai.providers, provider] });
  };

  const removeProvider = (id: string) => {
    if (!ai) return;
    const providers = ai.providers.filter((provider) => provider.id !== id);
    const fallbackChoice = (choice?: AiModelChoice) =>
      choice && choice.providerId === id ? undefined : choice;
    const first = providers[0];
    setAi({
      ...ai,
      providers,
      reader: fallbackChoice(ai.reader) || { providerId: first.id, model: "" },
      translator: fallbackChoice(ai.translator) || { providerId: first.id, model: "" },
      readerFallback: fallbackChoice(ai.readerFallback),
      translatorFallback: fallbackChoice(ai.translatorFallback),
    });
  };

  const pickRecipe = (recipe: SetupRecipe) => {
    if (!ai) return;
    const { next, added } = applyRecipe(ai, recipe);
    setAi(next);
    setNotice(
      added.length
        ? `${recipe.label} selected. Added ${added.join(" and ")} below: paste the API key there, then save.`
        : `${recipe.label} selected. Save to use it.`,
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          targetLanguage: local.targetLanguage,
          customInstructions: local.customInstructions || "",
          developerMode: local.developerMode === true,
          ai: local.ai,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Settings could not be saved");
      initializeSettings(data as TranslationSettings);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  const modelsOf = (providerId: string) =>
    ai
      ? [...new Set(
          [ai.reader, ai.translator, ai.readerFallback, ai.translatorFallback]
            .filter((choice): choice is AiModelChoice => !!choice && choice.providerId === providerId && !!choice.model)
            .map((choice) => choice.model),
        )]
      : [];

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      size="xl"
      title="Settings"
      description="Translation, AI models and providers, account"
      footer={
        <>
          {error && <span className="mr-auto text-xs text-shu">{error}</span>}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} loading={saving}>
            Save changes
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Section label="Translation" first>
          <Field label="Target language">
            {({ id }) => (
              <Select
                id={id}
                value={local.targetLanguage}
                onChange={(e) => setLocal((prev) => ({ ...prev, targetLanguage: e.target.value }))}
              >
                {TARGET_LANGUAGES.map((language) => (
                  <option key={language} value={language}>
                    {language}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Extra rules for the translator" hint="Names, tone, terms to keep. Each line is a rule.">
            {({ id, describedBy }) => (
              <Textarea
                id={id}
                aria-describedby={describedBy}
                className="min-h-24"
                value={local.customInstructions || ""}
                onChange={(e) => setLocal((prev) => ({ ...prev, customInstructions: e.target.value }))}
              />
            )}
          </Field>
        </Section>

        {ai && (
          <Section
            label="How pages are translated"
            aside={
              <Button
                size="sm"
                variant="ghost"
                icon={<Gauge />}
                onClick={() => {
                  onClose();
                  toggleUsageModal(true);
                }}
              >
                Usage & limits
              </Button>
            }
          >
            <ol className="grid gap-2 text-xs leading-relaxed text-ink-2 sm:grid-cols-3">
              <li className="rounded-control border border-line bg-page-2 px-3 py-2">
                <span className="font-medium text-ink">1. Find text</span> · on this server from the page pixels. Free,
                no model involved.
              </li>
              <li className="rounded-control border border-line bg-page-2 px-3 py-2">
                <span className="font-medium text-ink">2. Read</span> · a vision model writes down the original text of
                every balloon. One call per page, most of the tokens.
              </li>
              <li className="rounded-control border border-line bg-page-2 px-3 py-2">
                <span className="font-medium text-ink">3. Translate</span> · any text model translates the page in one
                call. Then the page is typeset here, free.
              </li>
            </ol>
            {usage && <CapacityBanner summary={usage} />}
          </Section>
        )}

        {ai && (
          <Section label="Quick setups">
            <SetupRecipes ai={ai} onApply={pickRecipe} />
            {notice && (
              <p role="status" className="text-xs leading-relaxed text-action">
                {notice}
              </p>
            )}
          </Section>
        )}

        {ai && (
          <Section label="Models">
            <ModelPicker
              label="Reading"
              hint="Looks at the page and writes down the original text of every balloon. Must read images; the biggest share of the cost."
              providers={ai.providers}
              value={ai.reader}
              needsVision
              stage="reading"
              limit={limitFor(ai.reader)}
              onChange={(choice) => choice && setAi({ ...ai, reader: choice })}
            />
            <ModelPicker
              label="Reading fallback"
              hint="Takes over reading when the main reader fails, e.g. its free quota is used up. Best on another provider."
              providers={ai.providers}
              value={ai.readerFallback}
              optional
              needsVision
              stage="reading"
              limit={limitFor(ai.readerFallback)}
              onChange={(choice) => setAi({ ...ai, readerFallback: choice })}
            />
            <ModelPicker
              label="Translation"
              hint="Translates the read text into your language. Text only, so any model works (DeepSeek too)."
              providers={ai.providers}
              value={ai.translator}
              stage="translation"
              limit={limitFor(ai.translator)}
              onChange={(choice) => choice && setAi({ ...ai, translator: choice })}
            />
            <ModelPicker
              label="Translation fallback"
              hint="Takes over translation when the main translator fails."
              providers={ai.providers}
              value={ai.translatorFallback}
              optional
              stage="translation"
              limit={limitFor(ai.translatorFallback)}
              onChange={(choice) => setAi({ ...ai, translatorFallback: choice })}
            />
          </Section>
        )}

        {ai && (
          <Section
            label="AI providers"
            aside={
              <>
                <Select
                  aria-label="Provider type"
                  value={newPreset}
                  onChange={(e) => setNewPreset(e.target.value)}
                  className="w-48"
                >
                  {PROVIDER_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                </Select>
                <Button size="sm" variant="secondary" icon={<Plus />} onClick={addProvider}>
                  Add
                </Button>
              </>
            }
          >
            <ul className="flex flex-col gap-2">
              {ai.providers.map((provider) => (
                <ProviderCard
                  key={provider.id}
                  provider={provider}
                  models={modelsOf(provider.id)}
                  limits={usage?.limits.filter((entry) => entry.providerId === provider.id) || []}
                  onChange={(next) =>
                    setAi({
                      ...ai,
                      providers: ai.providers.map((entry) => (entry.id === next.id ? next : entry)),
                    })
                  }
                  onRemove={ai.providers.length > 1 ? () => removeProvider(provider.id) : undefined}
                />
              ))}
            </ul>
            <p className="text-xs leading-relaxed text-ink-3">
              Any OpenAI-compatible API works (OpenAI, OpenRouter, DeepSeek, GLM, Qwen, local servers). Several keys of
              one provider are rotated; on free plans each key usually has its own daily quota.
            </p>
          </Section>
        )}

        <Section label="Display">
          <Switch
            checked={local.developerMode === true}
            onChange={(checked) => setLocal((prev) => ({ ...prev, developerMode: checked }))}
            label="Developer details"
            description="Show models, tokens, cost and timing on each page."
          />
        </Section>

        <Section label="Account">
          <PasswordChangeForm />
        </Section>
      </div>
    </Modal>
  );
};

export default SettingsModal;
