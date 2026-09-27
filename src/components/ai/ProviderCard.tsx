import { useProviderCheck } from "@/hooks/useAiUsage";
import { presetById } from "@/lib/aiCatalog";
import { LimitStatus } from "@/lib/aiUsage";
import { AiProviderConfig } from "@/types";
import { CheckCircle2, CircleHelp, KeyRound, Trash2, XCircle } from "lucide-react";
import React, { useState } from "react";
import { Button, Chip, IconButton, Input, Mono, Switch, Textarea } from "../ui";
import { formatUsd } from "./format";

export const SYSTEM_PROVIDER_ID = "system-gemini";

const parseKeys = (text: string) =>
  text
    .split(/[\n,]/)
    .map((key) => key.trim())
    .filter(Boolean);

/** One provider account: name, endpoint, keys, plan, and a key check. */
const ProviderCard: React.FC<{
  provider: AiProviderConfig;
  /** Models of the current setup that run on this provider. */
  models: string[];
  /** Today's limit rows of this provider. */
  limits: LimitStatus[];
  onChange: (provider: AiProviderConfig) => void;
  onRemove?: () => void;
}> = ({ provider, models, limits, onChange, onRemove }) => {
  const preset = presetById(provider.preset);
  const isSystem = provider.id === SYSTEM_PROVIDER_ID;
  // The typed text is kept while it still means the stored keys, so a
  // trailing newline survives; outside changes (fresh settings) replace it.
  const joinedKeys = provider.apiKeys.join("\n");
  const [draft, setDraft] = useState<string | null>(null);
  const keysText = draft !== null && parseKeys(draft).join("\n") === joinedKeys ? draft : joinedKeys;
  const { result, check, checking, error } = useProviderCheck(provider.id);
  const usedToday = limits.filter((entry) => entry.model !== "*").reduce((total, entry) => total + entry.usedToday, 0);
  const exhausted = limits.filter((entry) => entry.state === "exhausted");
  const listed = result?.keys.flatMap((key) => key.models || []) || [];
  const missing = listed.length ? models.filter((model) => !listed.includes(model)) : [];
  const keyCount = provider.apiKeys.length;

  return (
    <li className="flex flex-col gap-3 rounded-panel border border-line p-3">
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

      <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
        {models.length > 0 ? (
          <span>
            Used for <Mono className="text-ink-2">{models.length}</Mono> model{models.length === 1 ? "" : "s"} of your
            setup
          </span>
        ) : (
          <span>Not used by the current setup</span>
        )}
        <span aria-hidden="true">·</span>
        <span>
          <Mono className="text-ink-2">{usedToday}</Mono> call{usedToday === 1 ? "" : "s"} today
        </span>
        {exhausted.length > 0 && (
          <Chip size="sm" tone="danger">
            Quota used up
          </Chip>
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
            ? "Empty: the server's Gemini key is used (shared with every account). Add your own keys, one per line."
            : `API keys, one per line (${preset?.keyHint || "…"}). More keys = more free quota; they are rotated.`
        }
        value={keysText}
        onChange={(e) => {
          setDraft(e.target.value);
          onChange({ ...provider, apiKeys: parseKeys(e.target.value) });
        }}
      />

      <Switch
        size="sm"
        checked={provider.freeTier === true}
        onChange={(checked) => onChange({ ...provider, freeTier: checked })}
        label="Free plan"
        description="These keys are on a free plan: calls count against the free limits and cost $0."
      />

      {(preset?.freeTier || preset?.keyUrl) && (
        <p className="text-xs leading-relaxed text-ink-3">
          {preset.freeTier}
          {preset.keyUrl && (
            <>
              {preset.freeTier ? " " : ""}
              <a
                href={preset.keyUrl}
                target="_blank"
                rel="noreferrer"
                className="text-action underline hover:text-action-hover"
              >
                Get a key
              </a>
            </>
          )}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            icon={<KeyRound />}
            loading={checking}
            disabled={!isSystem && keyCount === 0}
            onClick={() => check(provider)}
          >
            Check keys
          </Button>
          {result && (
            <span className="text-xs text-ink-3">
              Checked {new Date(result.checkedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          {error && <span className="text-xs text-shu">{error instanceof Error ? error.message : String(error)}</span>}
        </div>
        {result && (
          <ul className="flex flex-col gap-1.5">
            {result.keys.map((key) => (
              <li key={key.keyHint} className="flex flex-col gap-0.5 rounded-control bg-page-2 px-2.5 py-2 text-xs">
                <div className="flex items-center gap-2">
                  {key.ok === true ? (
                    <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5 text-ok" />
                  ) : key.ok === false ? (
                    <XCircle aria-hidden="true" className="h-3.5 w-3.5 text-shu" />
                  ) : (
                    <CircleHelp aria-hidden="true" className="h-3.5 w-3.5 text-warn" />
                  )}
                  <Mono className="text-ink">{key.keyHint}</Mono>
                  <span className={key.ok === false ? "text-shu" : "text-ink-2"}>{key.message}</span>
                  {key.models && <span className="ml-auto text-ink-3">{key.models.length} models</span>}
                </div>
                {key.account?.freeDaily && (
                  <span className="text-ink-2">
                    Free models today:{" "}
                    <Mono className="text-ink">
                      {key.account.freeDaily.used} / {key.account.freeDaily.limit}
                    </Mono>{" "}
                    requests ({key.account.freeDaily.remaining} left)
                    {key.account.freeTier ? " · never bought credits, so the 50/day limit applies" : ""}
                  </span>
                )}
                {key.account?.creditsUsed !== undefined && (
                  <span className="text-ink-3">
                    Credits used: <Mono>{formatUsd(key.account.creditsUsed)}</Mono>
                    {key.account.creditsLimit != null ? ` of ${formatUsd(key.account.creditsLimit)}` : ""}
                  </span>
                )}
                {key.account?.balance && (
                  <span className="text-ink-2">
                    Balance: <Mono className="text-ink">{key.account.balance}</Mono>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {missing.length > 0 && (
          <p className="text-xs leading-relaxed text-warn">
            Not offered to these keys: {missing.join(", ")}. Check the model id or pick another model.
          </p>
        )}
      </div>
    </li>
  );
};

export default ProviderCard;
