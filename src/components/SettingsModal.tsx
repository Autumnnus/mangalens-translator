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
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import React, { useState } from "react";
import { GEMINI_MODELS, NamedApiKey, TranslationSettings } from "../types";

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

interface RadioCardProps {
  selected: boolean;
  onSelect: () => void;
  title: string;
  description: string;
  trailing?: React.ReactNode;
}

const RadioCard: React.FC<RadioCardProps> = ({
  selected,
  onSelect,
  title,
  description,
  trailing,
}) => (
  <button
    type="button"
    role="radio"
    aria-checked={selected}
    onClick={onSelect}
    className={`w-full rounded-control border p-3 text-left transition-colors duration-120 ${
      selected ? "border-action bg-npb" : "border-line hover:border-ink-3"
    }`}
  >
    <span className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium text-ink">{title}</span>
      {trailing}
    </span>
    <span className="mt-1 block text-xs leading-relaxed text-ink-2">{description}</span>
  </button>
);

const RangeField: React.FC<{
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  minLabel: string;
  maxLabel: string;
  hint: React.ReactNode;
}> = ({ label, value, display, min, max, step, onChange, minLabel, maxLabel, hint }) => (
  <Field
    label={
      <span className="flex items-center justify-between gap-3">
        <span>{label}</span>
        <Mono className="text-xs text-ink">{display}</Mono>
      </span>
    }
    hint={hint}
  >
    {({ id, describedBy }) => (
      <div className="flex flex-col gap-1">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-describedby={describedBy}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          className="w-full accent-action"
        />
        <div className="flex justify-between text-xs text-ink-3">
          <span>{minLabel}</span>
          <span>{maxLabel}</span>
        </div>
      </div>
    )}
  </Field>
);

/* ----------------------------------------------------------------------------
   Settings modal
   --------------------------------------------------------------------------- */

interface Props {
  isOpen: boolean;
  onClose: () => void;
  settings: TranslationSettings;
  onSettingsChange: (settings: TranslationSettings) => void;
}

type LocalOcrStatus = {
  configured: boolean;
  online: boolean;
  workerId: string | null;
  lastSeenAt: string | null;
  queuedJobs: number;
  activeJobs: number;
};

const PIPELINES: Array<{
  id: NonNullable<TranslationSettings["translationPipeline"]>;
  title: string;
  description: string;
}> = [
  {
    id: "auto",
    title: "Automatic",
    description:
      "Use Gemini Vision first and switch to local OCR only for an eligible safety rejection.",
  },
  {
    id: "gemini_vision",
    title: "Gemini Vision",
    description:
      "Always send the page to Gemini for detection and translation; local OCR is disabled.",
  },
  {
    id: "local_ocr",
    title: "Local OCR + text translation",
    description:
      "Detect text on your Mac, then send only the OCR text to Gemini. Uses fewer input tokens but still needs a working Gemini key.",
  },
];

const TARGET_LANGUAGES = ["Turkish", "English", "Spanish", "Japanese", "French", "German"];

const SettingsModal: React.FC<Props> = ({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
}) => {
  const [localSettings, setLocalSettings] =
    useState<TranslationSettings>(settings);
  const [ocrStatus, setOcrStatus] = useState<LocalOcrStatus | null>(null);

  const createApiKeyId = () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `key-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Sync with store/props when modal opens or settings change in store
  React.useEffect(() => {
    if (isOpen) {
      const migratedNamedKeys =
        settings.namedApiKeys && settings.namedApiKeys.length > 0
          ? settings.namedApiKeys
          : (settings.customApiKeyPool || "")
              .split(/[\n,]/g)
              .map((item) => item.trim())
              .filter((item) => item.length > 0)
              .map((key, index) => ({
                id: createApiKeyId(),
                name: `Key ${index + 1}`,
                key,
                enabled: true,
              }));

      setLocalSettings({
        ...settings,
        namedApiKeys: migratedNamedKeys,
      });
    }
  }, [isOpen, settings]);

  React.useEffect(() => {
    if (!isOpen) return;
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/local-ocr/status", {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("OCR status unavailable");
        const status = (await response.json()) as LocalOcrStatus;
        if (active) setOcrStatus(status);
      } catch {
        if (active) setOcrStatus(null);
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [isOpen]);

  const handleChange = (
    key: keyof TranslationSettings,
    value: string | number | boolean,
  ) => {
    setLocalSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    const preparedNamedKeys = (localSettings.namedApiKeys || []).map((item) => ({
      ...item,
      name: item.name.trim() || "Untitled Key",
      key: item.key.trim(),
      enabled: item.enabled ?? true,
    }));

    const preparedSettings: TranslationSettings = {
      ...localSettings,
      namedApiKeys: preparedNamedKeys,
      customApiKeyPool: preparedNamedKeys.map((item) => item.key).join("\n"),
    };

    onSettingsChange(preparedSettings);
    onClose();
  };

  const setNamedKeys = (updater: (prev: NamedApiKey[]) => NamedApiKey[]) => {
    setLocalSettings((prev) => ({
      ...prev,
      namedApiKeys: updater(prev.namedApiKeys || []),
    }));
  };

  const addNamedKey = () => {
    setNamedKeys((prev) => [
      ...prev,
      {
        id: createApiKeyId(),
        name: `Key ${prev.length + 1}`,
        key: "",
        enabled: true,
      },
    ]);
  };

  const updateNamedKey = (
    id: string,
    field: "name" | "key" | "enabled",
    value: string | boolean,
  ) => {
    setNamedKeys((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    );
  };

  const removeNamedKey = (id: string) => {
    setNamedKeys((prev) => prev.filter((item) => item.id !== id));
  };

  const moveNamedKey = (id: string, direction: -1 | 1) => {
    setNamedKeys((prev) => {
      const index = prev.findIndex((item) => item.id === id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(index, 1);
      copy.splice(nextIndex, 0, item);
      return copy;
    });
  };

  const namedKeys = localSettings.namedApiKeys || [];
  const useCustomApiKey = localSettings.useCustomApiKey === true;
  const batchSize = localSettings.batchSize || 10;
  const batchDelay = localSettings.batchDelay || 0;

  const ocrChip = ocrStatus?.online ? (
    <Chip tone="ok">
      Online · <Mono>{ocrStatus.workerId}</Mono>
    </Chip>
  ) : ocrStatus?.configured ? (
    <Chip tone="warn">Worker offline</Chip>
  ) : (
    <Chip tone="neutral">No worker configured</Chip>
  );

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      size="lg"
      title="Settings"
      description="Translation engine, keys and account"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave}>
            Save changes
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Translation */}
        <Section label="Translation" first>
          <Field label="Target language">
            {({ id }) => (
              <Select
                id={id}
                value={localSettings.targetLanguage}
                onChange={(e) => handleChange("targetLanguage", e.target.value)}
              >
                {TARGET_LANGUAGES.map((language) => (
                  <option key={language} value={language}>
                    {language}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </Section>

        {/* Text detection */}
        <Section
          label="Text detection"
          aside={
            <>
              {ocrStatus?.configured && (
                <Mono className="text-xs text-ink-3">
                  Queue {ocrStatus.queuedJobs} · Active {ocrStatus.activeJobs}
                </Mono>
              )}
              {ocrChip}
            </>
          }
        >
          <div role="radiogroup" aria-label="Text detection pipeline" className="flex flex-col gap-2">
            {PIPELINES.map((pipeline) => (
              <RadioCard
                key={pipeline.id}
                selected={(localSettings.translationPipeline || "auto") === pipeline.id}
                onSelect={() => handleChange("translationPipeline", pipeline.id)}
                title={pipeline.title}
                description={pipeline.description}
              />
            ))}
          </div>
        </Section>

        {/* Model */}
        <Section label="Model">
          <div role="radiogroup" aria-label="Gemini model" className="flex flex-col gap-2">
            {GEMINI_MODELS.map((model) => (
              <RadioCard
                key={model.id}
                selected={localSettings.model === model.id}
                onSelect={() => handleChange("model", model.id)}
                title={model.name}
                description={model.description}
                trailing={
                  <Chip tone="neutral" className="font-mono tabular">
                    {model.inputCostPer1k === 0 ? "Free" : `$${model.inputCostPer1k}/1k`}
                  </Chip>
                }
              />
            ))}
          </div>
        </Section>

        {/* Gemini API keys */}
        <Section
          label="Gemini API keys"
          aside={
            useCustomApiKey && (
              <Button size="sm" variant="secondary" icon={<Plus />} onClick={addNamedKey}>
                Add key
              </Button>
            )
          }
        >
          <Switch
            checked={useCustomApiKey}
            onChange={(checked) => handleChange("useCustomApiKey", checked)}
            label="Use my own keys"
            description="Off: the server's default key is used. On: requests rotate through the keys below, in order."
          />

          {useCustomApiKey && (
            <div className="flex flex-col gap-2">
              {namedKeys.length === 0 ? (
                <p className="rounded-control border border-dashed border-line px-3 py-4 text-center text-xs text-ink-3">
                  No keys yet. Add a key to start the list.
                </p>
              ) : (
                <ul className="divide-y divide-line rounded-control border border-line">
                  {namedKeys.map((item, index) => (
                    <li key={item.id} className="flex items-center gap-2 p-2">
                      <Mono className="w-5 shrink-0 text-center text-xs text-ink-3">
                        {index + 1}
                      </Mono>
                      <Input
                        inputSize="sm"
                        aria-label={`Key ${index + 1} name`}
                        placeholder="Name"
                        value={item.name}
                        onChange={(e) => updateNamedKey(item.id, "name", e.target.value)}
                        className="w-32 shrink-0"
                      />
                      <Input
                        inputSize="sm"
                        mono
                        type="password"
                        autoComplete="off"
                        aria-label={`Key ${index + 1} value`}
                        placeholder="AIza…"
                        value={item.key}
                        onChange={(e) => updateNamedKey(item.id, "key", e.target.value)}
                        className="min-w-0 flex-1"
                      />
                      <IconButton
                        size="sm"
                        label="Move up"
                        disabled={index === 0}
                        onClick={() => moveNamedKey(item.id, -1)}
                      >
                        <ArrowUp />
                      </IconButton>
                      <IconButton
                        size="sm"
                        label="Move down"
                        disabled={index === namedKeys.length - 1}
                        onClick={() => moveNamedKey(item.id, 1)}
                      >
                        <ArrowDown />
                      </IconButton>
                      <IconButton
                        size="sm"
                        variant="danger"
                        label="Remove key"
                        onClick={() => removeNamedKey(item.id)}
                      >
                        <Trash2 />
                      </IconButton>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs leading-relaxed text-ink-3">
                Keys are tried top to bottom. A rate-limited key is skipped and the next one is
                used; cooldowns follow the model limits (RPM, RPD, TPM). Get keys from{" "}
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-action underline-offset-2 hover:underline"
                >
                  Google AI Studio
                </a>
                .
              </p>
            </div>
          )}
        </Section>

        {/* Batching */}
        <Section label="Batching">
          <div className="flex flex-col gap-3">
            <Switch
              checked={localSettings.useGeminiBatch !== false}
              onChange={(checked) => handleChange("useGeminiBatch", checked)}
              label="Gemini batch pricing"
              description="Paid Gemini tiers run asynchronous jobs at half price; unsupported and free tiers fall back to normal requests."
            />
            <Switch
              checked={localSettings.enableQualityFallback !== false}
              onChange={(checked) => handleChange("enableQualityFallback", checked)}
              label="Quality fallback"
              description="Uncertain Flash-Lite pages are retried with Gemini 2.5 Flash."
            />
            <Switch
              checked={localSettings.developerMode === true}
              onChange={(checked) => handleChange("developerMode", checked)}
              label="Developer mode"
              description="Show pipeline, OCR engine, model, timing, token and fallback details on each page."
            />
          </div>

          <RangeField
            label="Batch size"
            value={batchSize}
            display={`${batchSize} ${batchSize === 1 ? "page" : "pages"}`}
            min={1}
            max={10}
            step={1}
            onChange={(value) => handleChange("batchSize", value)}
            minLabel="1 · safest"
            maxLabel="10 · fastest"
            hint="Pages translated in parallel. The free Gemini tier allows about 15 requests per minute; 1 to 3 is safe there."
          />

          <RangeField
            label="Delay between batches"
            value={batchDelay}
            display={`${batchDelay} ms`}
            min={0}
            max={5000}
            step={500}
            onChange={(value) => handleChange("batchDelay", value)}
            minLabel="0 ms"
            maxLabel="5 s"
            hint="A pause between batches helps avoid 429 rate-limit errors on free accounts."
          />
        </Section>

        {/* Prompt guidelines */}
        <Section label="Prompt guidelines">
          <Field
            label="Extra rules for the model"
            hint="Each line becomes a strict rule for the model."
          >
            {({ id, describedBy }) => (
              <Textarea
                id={id}
                aria-describedby={describedBy}
                className="min-h-28"
                value={localSettings.customInstructions || ""}
                onChange={(e) => handleChange("customInstructions", e.target.value)}
                placeholder="Example: keep sound effects in Japanese and add a small translation below them."
              />
            )}
          </Field>
        </Section>

        {/* Typesetting */}
        <Section label="Typesetting">
          <p className="text-sm leading-relaxed text-ink-2">
            Fonts, sizes, colours and bubble cleaning are decided per balloon by the server
            renderer and stored with each page. Correct them in the layout editor instead of
            through a global setting.
          </p>
        </Section>

        {/* Account */}
        <Section label="Account">
          <PasswordChangeForm />
        </Section>
      </div>
    </Modal>
  );
};

export default SettingsModal;
