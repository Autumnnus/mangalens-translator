"use client";

import { useAiUsage } from "@/hooks/useAiUsage";
import { DailyUsage, UsageSummary, UsageTotals } from "@/lib/aiUsage";
import { Gauge, RefreshCw } from "lucide-react";
import React, { useState } from "react";
import { cn } from "../../utils/cn";
import { Button, Chip, EmptyState, Modal, Mono, SectionLabel, SegmentedControl, Skeleton, Spinner } from "../ui";
import {
  formatClock,
  formatDay,
  formatDuration,
  formatRelative,
  formatTokens,
  formatUsd,
  STAGE_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
} from "./format";
import LimitMeter, { modelLabel } from "./LimitMeter";

/* ----------------------------------------------------------------------------
   Pieces
   --------------------------------------------------------------------------- */

const Stat: React.FC<{ label: string; totals: UsageTotals }> = ({ label, totals }) => (
  <div className="flex flex-col gap-2 rounded-panel border border-line bg-page p-3">
    <SectionLabel>{label}</SectionLabel>
    <div className="flex items-baseline gap-2">
      <Mono className="text-xl font-semibold text-ink">{formatUsd(totals.costUsd)}</Mono>
      {totals.savedUsd > 0 && (
        <Mono className="text-xs text-ok" title="What the calls on free plans would have cost at list price">
          {formatUsd(totals.savedUsd)} saved
        </Mono>
      )}
    </div>
    <dl className="grid grid-cols-3 gap-2 text-xs">
      <div>
        <dt className="text-ink-3">Pages</dt>
        <dd>
          <Mono className="text-ink">{totals.pages}</Mono>
        </dd>
      </div>
      <div>
        <dt className="text-ink-3">Calls</dt>
        <dd>
          <Mono className="text-ink">{totals.calls}</Mono>
          {totals.failed > 0 && <Mono className="block text-shu">{totals.failed} failed</Mono>}
        </dd>
      </div>
      <div>
        <dt className="text-ink-3">Tokens</dt>
        <dd>
          <Mono className="text-ink" title={`${totals.inputTokens} in · ${totals.outputTokens} out`}>
            {formatTokens(totals.inputTokens + totals.outputTokens)}
          </Mono>
        </dd>
      </div>
    </dl>
  </div>
);

type Metric = "pages" | "calls" | "costUsd" | "tokens";

const metricValue = (day: DailyUsage, metric: Metric) => day[metric];
const metricText = (value: number, metric: Metric) =>
  metric === "costUsd" ? formatUsd(value) : metric === "tokens" ? formatTokens(value) : String(value);

const DailyChart: React.FC<{ daily: DailyUsage[] }> = ({ daily }) => {
  const [metric, setMetric] = useState<Metric>("pages");
  const max = Math.max(...daily.map((day) => metricValue(day, metric)), 0);
  const total = daily.reduce((sum, day) => sum + metricValue(day, metric), 0);
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionLabel>Last 30 days</SectionLabel>
        <SegmentedControl
          size="sm"
          label="Chart metric"
          value={metric}
          onChange={setMetric}
          options={[
            { value: "pages", label: "Pages" },
            { value: "calls", label: "Calls" },
            { value: "tokens", label: "Tokens" },
            { value: "costUsd", label: "Cost" },
          ]}
        />
      </div>
      <div className="rounded-panel border border-line bg-page p-3">
        <div className="mb-2 flex items-baseline justify-between text-xs text-ink-3">
          <span>
            Total <Mono className="text-ink">{metricText(total, metric)}</Mono>
          </span>
          <span>
            Peak <Mono className="text-ink">{metricText(max, metric)}</Mono>
          </span>
        </div>
        <div className="flex h-28 items-end gap-[3px]" role="img" aria-label={`Daily ${metric} over the last 30 days`}>
          {daily.map((day) => {
            const value = metricValue(day, metric);
            const height = max > 0 ? Math.max(value > 0 ? 4 : 0, (value / max) * 100) : 0;
            const failedShare = metric === "calls" && day.calls > 0 ? day.failed / day.calls : 0;
            return (
              <div
                key={day.date}
                className="group relative flex h-full min-w-0 flex-1 flex-col justify-end"
                title={`${formatDay(day.date)}: ${day.pages} pages · ${day.calls} calls${day.failed ? ` (${day.failed} failed)` : ""} · ${formatTokens(day.tokens)} tokens · ${formatUsd(day.costUsd)}`}
              >
                <div
                  className={cn(
                    "flex w-full flex-col justify-start overflow-hidden rounded-t-[2px] bg-action/70 transition-colors duration-120 group-hover:bg-action",
                    value === 0 && "bg-line",
                  )}
                  style={{ height: value === 0 ? 1 : `${height}%` }}
                >
                  {failedShare > 0 && <div className="w-full bg-shu" style={{ height: `${failedShare * 100}%` }} />}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-1.5 flex justify-between text-xs text-ink-3">
          <span>{formatDay(daily[0].date)}</span>
          <span>{formatDay(daily[Math.floor(daily.length / 2)].date)}</span>
          <span>Today</span>
        </div>
      </div>
    </section>
  );
};

const ModelTable: React.FC<{ summary: UsageSummary }> = ({ summary }) => {
  const now = Date.parse(summary.generatedAt);
  return (
    <section className="flex flex-col gap-3">
      <SectionLabel>By model · last 30 days</SectionLabel>
      <div className="overflow-x-auto rounded-panel border border-line">
        <table className="w-full min-w-[640px] text-left text-xs [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
          <thead className="border-b border-line bg-page-2 text-ink-3">
            <tr>
              <th className="px-3 py-2 font-medium">Model</th>
              <th className="px-3 py-2 font-medium">Stage</th>
              <th className="px-3 py-2 text-right font-medium">Calls</th>
              <th className="px-3 py-2 text-right font-medium">Tokens in/out</th>
              <th className="px-3 py-2 text-right font-medium">Cost</th>
              <th className="px-3 py-2 text-right font-medium">Avg time</th>
              <th className="px-3 py-2 text-right font-medium">Last used</th>
            </tr>
          </thead>
          <tbody>
            {summary.models.map((row) => (
              <tr key={`${row.providerId}-${row.model}-${row.stage}`} className="border-b border-line-2 last:border-0">
                <td className="px-3 py-2">
                  <div className="text-sm text-ink" title={row.model}>
                    {modelLabel(row.model)}
                  </div>
                  <div className="text-ink-3">{row.providerName}</div>
                </td>
                <td className="px-3 py-2 text-ink-2">{STAGE_LABEL[row.stage] || row.stage}</td>
                <td className="px-3 py-2 text-right">
                  <Mono className="text-ink">{row.calls}</Mono>
                  {row.failed > 0 && <Mono className="block text-shu">{row.failed} failed</Mono>}
                </td>
                <td className="px-3 py-2 text-right">
                  <Mono className="text-ink-2">
                    {formatTokens(row.inputTokens)} / {formatTokens(row.outputTokens)}
                  </Mono>
                </td>
                <td className="px-3 py-2 text-right">
                  <Mono className="text-ink">{formatUsd(row.costUsd)}</Mono>
                  {row.savedUsd > 0 && (
                    <div>
                      <Mono className="text-ok">{formatUsd(row.savedUsd)} saved</Mono>
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <Mono className="text-ink-2">{formatDuration(row.avgDurationMs)}</Mono>
                </td>
                <td
                  className="px-3 py-2 text-right text-ink-3"
                  title={row.lastUsedAt ? new Date(row.lastUsedAt).toLocaleString() : undefined}
                >
                  {row.lastUsedAt ? formatRelative(row.lastUsedAt, now) : "–"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

/** Banner with the one number that matters most on free plans. */
export const CapacityBanner: React.FC<{ summary: UsageSummary; className?: string }> = ({ summary, className }) => {
  const { pagesLeftToday, limitedBy } = summary.capacity;
  const stuck = summary.limits.filter((entry) => entry.state === "exhausted" && entry.roles.length > 0);
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-panel border px-3 py-2.5 text-sm",
        pagesLeftToday === 0 ? "border-shu/40 bg-shu-soft" : "border-line bg-page-2",
        className,
      )}
    >
      {pagesLeftToday === null ? (
        <span className="text-ink-2">
          No daily limit is known for this setup, so there is no page count to show. Paid plans and providers that do
          not report limits bill per token instead.
        </span>
      ) : pagesLeftToday === 0 ? (
        <span className="text-shu">
          Today&apos;s free quota is used up for this setup. Add a fallback model from another provider or wait for the
          reset.
        </span>
      ) : (
        <span className="text-ink">
          About <Mono className="font-semibold">{pagesLeftToday}</Mono> more page{pagesLeftToday === 1 ? "" : "s"} today
          with the current setup
          {limitedBy ? <span className="text-ink-3"> · {modelLabel(limitedBy)} runs out first</span> : null}.
        </span>
      )}
      {stuck.length > 0 && pagesLeftToday !== 0 && (
        <span className="text-xs text-warn">
          Used up today: {stuck.map((entry) => modelLabel(entry.model)).join(", ")}.
        </span>
      )}
    </div>
  );
};

/* ----------------------------------------------------------------------------
   Modal
   --------------------------------------------------------------------------- */

const UsageModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const { data: summary, isLoading, error, refetch, isFetching } = useAiUsage(open);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      icon={<Gauge />}
      title="AI usage"
      description={
        summary?.trackingSince
          ? `Calls, tokens, cost and limits. Tracked since ${new Date(summary.trackingSince).toLocaleDateString()}.`
          : "Calls, tokens, cost and limits of your AI providers."
      }
      footer={
        <>
          {summary && (
            <span className="mr-auto text-xs text-ink-3">
              All time: <Mono className="text-ink-2">{summary.lifetime.pages}</Mono> pages ·{" "}
              <Mono className="text-ink-2">{formatUsd(summary.lifetime.costUsd)}</Mono>
            </span>
          )}
          <Button
            variant="ghost"
            icon={isFetching ? <Spinner size="xs" /> : <RefreshCw />}
            onClick={() => void refetch()}
          >
            Refresh
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      {isLoading && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-40" />
          <Skeleton className="h-32" />
        </div>
      )}
      {error && !summary && (
        <EmptyState
          className="py-8"
          title="Usage could not be loaded"
          description={error instanceof Error ? error.message : String(error)}
        />
      )}
      {summary && (
        <div className="flex flex-col gap-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Today" totals={summary.today} />
            <Stat label="Last 7 days" totals={summary.week} />
            <Stat label="Last 30 days" totals={summary.month} />
          </div>

          <section className="flex flex-col gap-3">
            <SectionLabel>Today&apos;s limits</SectionLabel>
            <CapacityBanner summary={summary} />
            <ul className="flex flex-col divide-y divide-line-2 rounded-panel border border-line">
              {summary.limits.map((entry) => (
                <li key={`${entry.providerId}-${entry.model}`} className="px-3 py-3">
                  <LimitMeter status={entry} />
                </li>
              ))}
            </ul>
            <p className="text-xs leading-relaxed text-ink-3">
              Counts come from the calls this app made. A key used elsewhere too, or the shared server key, can run out
              sooner. Providers change free limits; a limit the provider reports replaces the typical one.
            </p>
          </section>

          <DailyChart daily={summary.daily} />

          {summary.models.length > 0 ? (
            <ModelTable summary={summary} />
          ) : (
            <EmptyState
              className="py-8"
              title="No calls recorded yet"
              description="Translate a page and its reading and translation calls show up here."
            />
          )}

          {summary.problems.length > 0 && (
            <section className="flex flex-col gap-3">
              <SectionLabel>Recent problems</SectionLabel>
              <ul className="flex flex-col divide-y divide-line-2 rounded-panel border border-line">
                {summary.problems.map((problem, index) => (
                  <li key={`${problem.at}-${index}`} className="flex flex-col gap-1 px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <Chip size="sm" tone={STATUS_TONE[problem.status]}>
                        {STATUS_LABEL[problem.status] || problem.status}
                      </Chip>
                      <span className="text-ink">{modelLabel(problem.model)}</span>
                      <span className="text-ink-3">
                        {problem.providerName} · {STAGE_LABEL[problem.stage] || problem.stage}
                      </span>
                      <Mono className="ml-auto text-ink-3">
                        {new Date(problem.at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}{" "}
                        {formatClock(problem.at)}
                      </Mono>
                    </div>
                    <p className="line-clamp-2 text-xs leading-relaxed text-ink-2" title={problem.error}>
                      {problem.error}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </Modal>
  );
};

export default UsageModal;
