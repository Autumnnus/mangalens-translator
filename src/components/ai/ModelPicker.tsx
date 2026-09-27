import { useProviderCheck } from "@/hooks/useAiUsage";
import { CatalogModel, catalogModel, pageCost, PAGE_TOKENS, presetById } from "@/lib/aiCatalog";
import { LimitStatus } from "@/lib/aiUsage";
import { AiModelChoice, AiProviderConfig } from "@/types";
import React, { useState } from "react";
import { Chip, Field, Input, Mono, Select } from "../ui";
import { formatPageCost } from "./format";
import LimitMeter from "./LimitMeter";

type Stage = keyof typeof PAGE_TOKENS;

const ModelInfo: React.FC<{ model: CatalogModel; stage: Stage; needsVision?: boolean; free: boolean }> = ({
  model,
  stage,
  needsVision,
  free,
}) => {
  const cost = pageCost(model, stage);
  const tokens = PAGE_TOKENS[stage];
  return (
    <div className="flex flex-col gap-1 text-xs leading-relaxed text-ink-2">
      {model.summary && <span>{model.summary}</span>}
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip size="sm" tone={model.vision ? "accent" : "neutral"}>
          {model.vision ? "Reads images" : "Text only"}
        </Chip>
        {model.free && <Chip size="sm">{model.free}</Chip>}
        {model.note && <Chip size="sm">{model.note}</Chip>}
      </div>
      <Mono className="text-ink-3">
        {model.inputPer1M !== undefined
          ? `$${model.inputPer1M} in · $${model.outputPer1M} out per 1M tokens`
          : "Price not listed"}
        {` · a page uses ≈ ${Math.round((tokens.input + tokens.output) / 1000)}k tokens here`}
        {cost !== undefined ? ` ≈ ${free ? "free on your plan" : formatPageCost(cost)}` : ""}
      </Mono>
      {needsVision && !model.vision && (
        <span className="text-shu">This model cannot read images; pick a vision model for reading.</span>
      )}
    </div>
  );
};

const CUSTOM_MODEL = "__custom__";

/** Provider + model for one pipeline stage, with what the model costs and how much of it is left today. */
const ModelPicker: React.FC<{
  label: string;
  hint: string;
  providers: AiProviderConfig[];
  value?: AiModelChoice;
  optional?: boolean;
  needsVision?: boolean;
  stage: Stage;
  limit?: LimitStatus;
  onChange: (choice?: AiModelChoice) => void;
}> = ({ label, hint, providers, value, optional, needsVision, stage, limit, onChange }) => {
  const provider = providers.find((entry) => entry.id === value?.providerId);
  const preset = provider ? presetById(provider.preset) : undefined;
  const models = (preset?.models || []).filter((model) => !needsVision || model.vision);
  const known = value ? catalogModel(value.model) : undefined;
  const listed = !!value && models.some((model) => model.id === value.model);
  const [customOpen, setCustomOpen] = useState(false);
  const custom = !!value && (customOpen || !listed);
  const { result } = useProviderCheck(value?.providerId || "");
  const discovered = [...new Set(result?.keys.flatMap((key) => key.models || []) || [])].sort();
  const listId = `models-${label.replace(/\W+/g, "-")}`;
  const free = provider?.freeTier === true || known?.inputPer1M === 0;

  return (
    <Field label={label}>
      {() => (
        <div className="flex flex-col gap-2">
          <p className="-mt-0.5 text-xs leading-relaxed text-ink-3">{hint}</p>
          <div className="flex flex-wrap gap-2">
            <Select
              aria-label={`${label} provider`}
              value={value?.providerId || ""}
              onChange={(e) => {
                const next = e.target.value;
                setCustomOpen(false);
                if (!next) return onChange(undefined);
                const nextPreset = presetById(providers.find((entry) => entry.id === next)?.preset || "");
                const first = nextPreset?.models.find((model) => !needsVision || model.vision);
                onChange({ providerId: next, model: first?.id || "" });
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
            {value && models.length > 0 && (
              <Select
                aria-label={`${label} model`}
                value={custom ? CUSTOM_MODEL : value.model}
                onChange={(e) => {
                  if (e.target.value === CUSTOM_MODEL) return setCustomOpen(true);
                  setCustomOpen(false);
                  onChange({ providerId: value.providerId, model: e.target.value });
                }}
                className="min-w-0 flex-1"
              >
                {models.map((model) => {
                  const cost = pageCost(model, stage);
                  const onFreePlan = provider?.freeTier === true && !!model.free;
                  return (
                    <option key={model.id} value={model.id}>
                      {model.label}
                      {onFreePlan
                        ? " · free on your plan"
                        : cost !== undefined
                          ? ` · ${formatPageCost(cost)}/page`
                          : ""}
                    </option>
                  );
                })}
                <option value={CUSTOM_MODEL}>Other model id…</option>
              </Select>
            )}
          </div>
          {value && (custom || models.length === 0) && (
            <>
              <Input
                mono
                aria-label={`${label} model id`}
                list={discovered.length ? listId : undefined}
                placeholder={needsVision ? "vision model id, e.g. gpt-4o-mini" : "model id"}
                value={value.model}
                onChange={(e) => onChange({ ...value, model: e.target.value })}
              />
              {discovered.length > 0 && (
                <datalist id={listId}>
                  {discovered.map((id) => (
                    <option key={id} value={id} />
                  ))}
                </datalist>
              )}
            </>
          )}
          {value && !known && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
              <span>
                {needsVision ? "Make sure this model reads images. " : ""}Price per 1M tokens (for cost tracking):
              </span>
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
          {value && known && <ModelInfo model={known} stage={stage} needsVision={needsVision} free={free} />}
          {value && limit && (
            <div className="rounded-control border border-line-2 bg-page-2 px-2.5 py-2">
              <LimitMeter status={limit} compact />
            </div>
          )}
        </div>
      )}
    </Field>
  );
};

export default ModelPicker;
