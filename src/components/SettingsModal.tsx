import {
  Button,
  Chip,
  Field,
  IconButton,
  Input,
  Modal,
  Mono,
  SectionLabel,
  Select,
  Switch,
  Textarea,
} from "@/components/ui";
import { catalogModel, presetById, PROVIDER_PRESETS } from "@/lib/aiCatalog";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { Plus, Trash2 } from "lucide-react";
import React, { useEffect, useState } from "react";
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
   AI providers and models
   --------------------------------------------------------------------------- */

const SYSTEM_PROVIDER_ID = "system-gemini";

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().slice(0, 12)
    : `p-${Date.now().toString(36)}`;

const ProviderCard: React.FC<{
  provider: AiProviderConfig;
  onChange: (provider: AiProviderConfig) => void;
  onRemove?: () => void;
}> = ({ provider, onChange, onRemove }) => {
  const preset = presetById(provider.preset);
  const isSystem = provider.id === SYSTEM_PROVIDER_ID;
  return (
    <li className="flex flex-col gap-2 rounded-control border border-line p-3">
      <div className="flex items-center gap-2">
        <Input
          inputSize="sm"
          aria-label="Provider name"
          value={provider.name}
          onChange={(e) => onChange({ ...provider, name: e.target.value })}
          className="min-w-0 flex-1"
        />
        <Chip tone="neutral">{preset?.label || provider.preset}</Chip>
        {onRemove && (
          <IconButton size="sm" variant="danger" label="Remove provider" onClick={onRemove}>
            <Trash2 />
          </IconButton>
        )}
      </div>
      {provider.kind === "openai" && (
        <Input
          inputSize="sm"
          mono
          aria-label="Base URL"
          placeholder="https://…/v1"
          value={provider.baseUrl ?? preset?.baseUrl ?? ""}
          onChange={(e) => onChange({ ...provider, baseUrl: e.target.value })}
        />
      )}
      <Textarea
        aria-label="API keys"
        className="min-h-16 font-mono text-xs"
        placeholder={
          isSystem
            ? "Empty: the server's Gemini key is used. Add your own keys, one per line."
            : `API keys, one per line (${preset?.keyHint || "…"}). Rotated on rate limits.`
        }
        value={provider.apiKeys.join("\n")}
        onChange={(e) =>
          onChange({ ...provider, apiKeys: e.target.value.split("\n").map((key) => key.trim()).filter(Boolean) })
        }
      />
    </li>
  );
};

const ModelPicker: React.FC<{
  label: string;
  hint: string;
  providers: AiProviderConfig[];
  value?: AiModelChoice;
  optional?: boolean;
  needsVision?: boolean;
  onChange: (choice?: AiModelChoice) => void;
}> = ({ label, hint, providers, value, optional, needsVision, onChange }) => {
  const provider = providers.find((entry) => entry.id === value?.providerId);
  const preset = provider ? presetById(provider.preset) : undefined;
  const models = (preset?.models || []).filter((model) => !needsVision || model.vision);
  const known = value ? catalogModel(value.model) : undefined;
  const listId = `models-${label.replace(/\W+/g, "-")}`;
  return (
    <Field label={label} hint={hint}>
      {() => (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Select
              aria-label={`${label} provider`}
              value={value?.providerId || ""}
              onChange={(e) => {
                const next = e.target.value;
                if (!next) return onChange(undefined);
                const nextPreset = presetById(providers.find((entry) => entry.id === next)?.preset || "");
                const first = nextPreset?.models.find((model) => !needsVision || model.vision);
                onChange({ providerId: next, model: first?.id || value?.model || "" });
              }}
              className="w-44 shrink-0"
            >
              {optional && <option value="">None</option>}
              {providers.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </Select>
            <Input
              mono
              aria-label={`${label} model`}
              list={listId}
              placeholder="model id"
              disabled={!value}
              value={value?.model || ""}
              onChange={(e) => value && onChange({ ...value, model: e.target.value })}
              className="min-w-0 flex-1"
            />
            <datalist id={listId}>
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                  {model.inputPer1M !== undefined ? ` · $${model.inputPer1M}/$${model.outputPer1M} per 1M` : ""}
                </option>
              ))}
            </datalist>
          </div>
          {value && !known && (
            <div className="flex items-center gap-2 text-xs text-ink-3">
              <span>Price per 1M tokens (for cost tracking):</span>
              <Input
                inputSize="sm"
                mono
                type="number"
                min={0}
                step="0.01"
                aria-label="Input price"
                placeholder="input"
                value={value.inputPer1M ?? ""}
                onChange={(e) =>
                  onChange({ ...value, inputPer1M: e.target.value === "" ? undefined : Number(e.target.value) })
                }
                className="w-24"
              />
              <Input
                inputSize="sm"
                mono
                type="number"
                min={0}
                step="0.01"
                aria-label="Output price"
                placeholder="output"
                value={value.outputPer1M ?? ""}
                onChange={(e) =>
                  onChange({ ...value, outputPer1M: e.target.value === "" ? undefined : Number(e.target.value) })
                }
                className="w-24"
              />
            </div>
          )}
          {value && known && known.inputPer1M !== undefined && (
            <Mono className="text-xs text-ink-3">
              ${known.inputPer1M} in · ${known.outputPer1M} out per 1M tokens{known.note ? ` · ${known.note}` : ""}
            </Mono>
          )}
        </div>
      )}
    </Field>
  );
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
  const [local, setLocal] = useState<TranslationSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newPreset, setNewPreset] = useState("openai");

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    // Always edit the server's view: it carries the resolved providers.
    void fetch("/api/settings", { cache: "no-store", credentials: "same-origin" })
      .then((response) => (response.ok ? response.json() : null))
      .then((fresh: TranslationSettings | null) => setLocal(fresh || settings))
      .catch(() => setLocal(settings));
  }, [isOpen, settings]);

  const ai: AiSettings | undefined = local.ai;
  const setAi = (next: AiSettings) => setLocal((prev) => ({ ...prev, ai: next }));

  const addProvider = () => {
    if (!ai) return;
    const preset = presetById(newPreset);
    if (!preset) return;
    const provider: AiProviderConfig = {
      id: newId(),
      name: preset.label,
      preset: preset.id,
      kind: preset.kind,
      baseUrl: preset.kind === "openai" ? preset.baseUrl : undefined,
      apiKeys: [],
    };
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
    });
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

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      size="lg"
      title="Settings"
      description="Translation, AI providers and account"
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
              Text boxes are always found from the page pixels; models only read and translate. Any
              OpenAI-compatible API works (OpenAI, OpenRouter, DeepSeek, GLM, Qwen, local servers).
            </p>
          </Section>
        )}

        {ai && (
          <Section label="Models">
            <ModelPicker
              label="Reading"
              hint="Reads the lettering from page crops. Needs a vision model."
              providers={ai.providers}
              value={ai.reader}
              needsVision
              onChange={(choice) => choice && setAi({ ...ai, reader: choice })}
            />
            <ModelPicker
              label="Translation"
              hint="Translates the transcribed text. Any text model."
              providers={ai.providers}
              value={ai.translator}
              onChange={(choice) => choice && setAi({ ...ai, translator: choice })}
            />
            <ModelPicker
              label="Reading fallback"
              hint="Used when the reading model keeps failing (outage, rate limits)."
              providers={ai.providers}
              value={ai.readerFallback}
              optional
              needsVision
              onChange={(choice) => setAi({ ...ai, readerFallback: choice })}
            />
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
