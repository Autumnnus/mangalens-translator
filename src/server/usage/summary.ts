import { db } from "@/db";
import { aiCalls, images, series } from "@/db/schema";
import { catalogModel, presetById } from "@/lib/aiCatalog";
import {
  AiCallStatus,
  AiStage,
  DailyUsage,
  keyHint,
  LimitStatus,
  LimitWindow,
  ModelUsageRow,
  RecentProblem,
  UsageSummary,
  UsageTotals,
} from "@/lib/aiUsage";
import { quotaDayEnd, quotaDayStart } from "@/server/llm/limits";
import { providerKeys } from "@/server/llm/settings";
import { AiSettings } from "@/types";
import { and, desc, eq, gte, isNotNull, min, sql } from "drizzle-orm";
import { ensureAiCallsTable } from "./ledger";

/**
 * Builds the usage screen from the ledger: totals per period, a daily series,
 * a per-model table and, for every model of the current setup, today's
 * standing against its limits.
 */

const DAYS = 30;
const DAY_MS = 24 * 3_600_000;

type Row = {
  createdAt: Date;
  imageId: string | null;
  stage: string;
  providerId: string;
  providerName: string;
  preset: string;
  model: string;
  keyHint: string | null;
  freeTier: boolean;
  status: string;
  error: string | null;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  costUsd: number;
  listCostUsd: number;
  durationMs: number | null;
  limits: typeof aiCalls.$inferSelect.limits;
};

const validTimeZone = (timeZone?: string | null) => {
  if (!timeZone) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return "UTC";
  }
};

const dateKey = (timeZone: string) => {
  const format = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  return (date: Date) => format.format(date);
};

/** Midnight of the day `now` falls on, in the viewer's time zone. */
const localDayStart = (timeZone: string, now: Date) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
  return new Date(
    now.getTime() - ((get("hour") * 60 + get("minute")) * 60 + get("second")) * 1000 - now.getUTCMilliseconds(),
  );
};

/** Calls that reached the provider and count against request quotas. */
const countsAgainstQuota = (status: string) => status === "ok" || status === "blocked" || status === "error";
const failed = (status: string) => status !== "ok";
const tokensOf = (row: Row) => row.inputTokens + row.outputTokens + row.reasoningTokens;

const emptyTotals = (): UsageTotals => ({
  calls: 0,
  failed: 0,
  pages: 0,
  inputTokens: 0,
  outputTokens: 0,
  costUsd: 0,
  savedUsd: 0,
});

const totalsOf = (rows: Row[]): UsageTotals => {
  const totals = emptyTotals();
  const pages = new Set<string>();
  for (const row of rows) {
    totals.calls += 1;
    if (failed(row.status)) totals.failed += 1;
    if (row.imageId && row.status === "ok" && row.stage === "reading") pages.add(row.imageId);
    totals.inputTokens += row.inputTokens;
    totals.outputTokens += row.outputTokens + row.reasoningTokens;
    totals.costUsd += row.costUsd;
    if (row.freeTier) totals.savedUsd += row.listCostUsd;
  }
  totals.pages = pages.size;
  return totals;
};

const isFreeModel = (model: string) => {
  const known = catalogModel(model);
  return model.endsWith(":free") || (known?.inputPer1M === 0 && known?.outputPer1M === 0);
};

type Role = LimitStatus["roles"][number];

export const getUsageSummary = async (
  userId: string,
  ai: AiSettings,
  options: { timeZone?: string | null; now?: Date } = {},
): Promise<UsageSummary> => {
  const now = options.now || new Date();
  const timeZone = validTimeZone(options.timeZone);
  const toDate = dateKey(timeZone);
  const todayStart = localDayStart(timeZone, now);
  const monthStart = new Date(todayStart.getTime() - (DAYS - 1) * DAY_MS);
  const weekStart = new Date(todayStart.getTime() - 6 * DAY_MS);

  const [lifetime] = await db
    .select({
      pages: sql<number>`count(*) filter (where ${images.usage} is not null)`.mapWith(Number),
      cost: sql<number>`coalesce(sum(${images.cost}), 0)`.mapWith(Number),
    })
    .from(images)
    .innerJoin(series, eq(images.seriesId, series.id))
    .where(eq(series.userId, userId));

  const ready = await ensureAiCallsTable();
  let rows: Row[] = [];
  let trackingSince: string | null = null;
  if (ready) {
    // Quota days can start before the viewer's day (Pacific midnight), so read a day more.
    const since = new Date(monthStart.getTime() - DAY_MS);
    rows = await db
      .select({
        createdAt: aiCalls.createdAt,
        imageId: aiCalls.imageId,
        stage: aiCalls.stage,
        providerId: aiCalls.providerId,
        providerName: aiCalls.providerName,
        preset: aiCalls.preset,
        model: aiCalls.model,
        keyHint: aiCalls.keyHint,
        freeTier: aiCalls.freeTier,
        status: aiCalls.status,
        error: aiCalls.error,
        inputTokens: aiCalls.inputTokens,
        outputTokens: aiCalls.outputTokens,
        reasoningTokens: aiCalls.reasoningTokens,
        costUsd: aiCalls.costUsd,
        listCostUsd: aiCalls.listCostUsd,
        durationMs: aiCalls.durationMs,
        limits: aiCalls.limits,
      })
      .from(aiCalls)
      .where(and(eq(aiCalls.userId, userId), gte(aiCalls.createdAt, since)))
      .orderBy(desc(aiCalls.createdAt));
    const [first] = await db
      .select({ since: min(aiCalls.createdAt) })
      .from(aiCalls)
      .where(and(eq(aiCalls.userId, userId), isNotNull(aiCalls.createdAt)));
    trackingSince = first?.since ? new Date(first.since).toISOString() : null;
  }

  const inMonth = rows.filter((row) => row.createdAt >= monthStart);

  // Daily series, oldest first, with empty days filled in.
  const byDay = new Map<string, Row[]>();
  for (const row of inMonth) {
    const key = toDate(row.createdAt);
    byDay.set(key, [...(byDay.get(key) || []), row]);
  }
  const daily: DailyUsage[] = [];
  for (let index = DAYS - 1; index >= 0; index -= 1) {
    const date = toDate(new Date(todayStart.getTime() - index * DAY_MS + DAY_MS / 2));
    const totals = totalsOf(byDay.get(date) || []);
    daily.push({
      date,
      calls: totals.calls,
      failed: totals.failed,
      pages: totals.pages,
      tokens: totals.inputTokens + totals.outputTokens,
      costUsd: totals.costUsd,
    });
  }

  // Per provider, model and stage over the month.
  const groups = new Map<string, Row[]>();
  for (const row of inMonth) {
    const key = `${row.providerId}\u0000${row.model}\u0000${row.stage}`;
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  const models: ModelUsageRow[] = [...groups.values()]
    .map((group) => {
      const totals = totalsOf(group);
      const timed = group.filter((row) => row.status === "ok" && row.durationMs !== null);
      const latest = group[0];
      return {
        providerId: latest.providerId,
        providerName: latest.providerName,
        preset: latest.preset,
        model: latest.model,
        stage: latest.stage as AiStage,
        calls: totals.calls,
        failed: totals.failed,
        inputTokens: totals.inputTokens,
        outputTokens: totals.outputTokens,
        costUsd: totals.costUsd,
        savedUsd: totals.savedUsd,
        avgDurationMs: timed.length
          ? Math.round(timed.reduce((total, row) => total + (row.durationMs || 0), 0) / timed.length)
          : null,
        lastUsedAt: latest.createdAt.toISOString(),
      };
    })
    .sort((a, b) => b.calls - a.calls);

  // Limits: every model of the current setup, plus anything used today.
  const roles = new Map<string, Role[]>();
  const addRole = (providerId: string, model: string, role?: Role) => {
    const key = `${providerId}\u0000${model}`;
    const list = roles.get(key) || [];
    if (role && !list.includes(role)) list.push(role);
    roles.set(key, list);
  };
  addRole(ai.reader.providerId, ai.reader.model, "reader");
  addRole(ai.translator.providerId, ai.translator.model, "translator");
  if (ai.readerFallback) addRole(ai.readerFallback.providerId, ai.readerFallback.model, "readerFallback");
  if (ai.translatorFallback) {
    addRole(ai.translatorFallback.providerId, ai.translatorFallback.model, "translatorFallback");
  }
  for (const row of rows) {
    if (row.createdAt >= quotaDayStart(row.preset, now)) addRole(row.providerId, row.model);
  }

  const limits: LimitStatus[] = [];
  const pools = new Map<string, LimitStatus>();
  for (const [key, modelRoles] of roles) {
    const [providerId, model] = key.split("\u0000");
    const provider = ai.providers.find((entry) => entry.id === providerId);
    const history = rows.filter((row) => row.providerId === providerId && row.model === model);
    const preset = provider?.preset || history[0]?.preset || "custom";
    const providerName = provider?.name || history[0]?.providerName || providerId;
    const dayStart = quotaDayStart(preset, now);
    const today = history.filter((row) => row.createdAt >= dayStart);
    const hints = provider ? providerKeys(provider).map(keyHint) : [...new Set(today.map((row) => row.keyHint || ""))];
    const freeTier = provider?.freeTier === true || isFreeModel(model);

    // Daily limit: what the provider reported beats the catalog.
    let dayLimit: number | undefined;
    let dayLimitSource: LimitStatus["dayLimitSource"];
    for (const row of history) {
      const reported =
        (row.limits?.quota?.scope === "day" ? row.limits.quota.limit : undefined) ??
        row.limits?.windows?.find((entry) => entry.window === "day" && entry.unit === "requests")?.limit;
      if (reported) {
        dayLimit = reported;
        dayLimitSource = "provider";
        break;
      }
    }
    const shared = presetById(preset)?.sharedDailyLimit;
    if (dayLimit === undefined && freeTier && !shared) {
      const known = catalogModel(model)?.freeLimit?.requestsPerDay;
      if (known) {
        dayLimit = known;
        dayLimitSource = "catalog";
      }
    }

    // Parked keys: a quota error today whose reset lies ahead.
    const parked = new Map<string, number>();
    for (const row of today) {
      if (row.status !== "quota_exhausted") continue;
      const until = Date.parse(row.limits?.quota?.resetAt || "");
      if (until > now.getTime() && !parked.has(row.keyHint || "")) parked.set(row.keyHint || "", until);
    }
    // A key that succeeded after its quota error is back.
    for (const row of today) {
      if (row.status === "ok" && parked.has(row.keyHint || "")) {
        const hitAt = today.find((entry) => entry.status === "quota_exhausted" && entry.keyHint === row.keyHint);
        if (hitAt && row.createdAt > hitAt.createdAt) parked.delete(row.keyHint || "");
      }
    }
    const allParked = hints.length > 0 && hints.every((hint) => parked.has(hint));
    const exhaustedUntil = allParked
      ? new Date(Math.min(...hints.map((hint) => parked.get(hint)!))).toISOString()
      : undefined;

    const usedToday = today.filter((row) => countsAgainstQuota(row.status)).length;
    // Header windows of the latest answered call; error responses report the failing key.
    const latestWindows = history.find((row) => row.status === "ok" && row.limits?.windows?.length);
    const windows: LimitWindow[] =
      latestWindows && now.getTime() - latestWindows.createdAt.getTime() < DAY_MS ? latestWindows.limits!.windows! : [];
    const lastProblem = today.find((row) => failed(row.status));
    const latest = history[0];
    const keys = Math.max(1, hints.length);
    const capacity = dayLimit !== undefined ? dayLimit * keys : undefined;

    let state: LimitStatus["state"] = latest ? "ok" : "unknown";
    if (exhaustedUntil) state = "exhausted";
    else if (latest?.status === "rate_limited" && now.getTime() - latest.createdAt.getTime() < 5 * 60_000) {
      state = "rate_limited";
    } else if (capacity !== undefined && usedToday >= capacity) state = "exhausted";
    else if (capacity !== undefined && usedToday >= capacity * 0.8) state = "near";
    else if (
      windows.some((entry) => entry.limit && entry.remaining !== undefined && entry.remaining <= entry.limit * 0.1)
    ) {
      state = "near";
    }

    limits.push({
      providerId,
      providerName,
      preset,
      model,
      roles: modelRoles,
      freeTier,
      usedToday,
      tokensToday: today.reduce((total, row) => total + tokensOf(row), 0),
      dayLimit,
      dayLimitSource,
      keys,
      dayResetsAt: quotaDayEnd(preset, now).toISOString(),
      exhaustedUntil:
        exhaustedUntil ||
        (capacity !== undefined && usedToday >= capacity ? quotaDayEnd(preset, now).toISOString() : undefined),
      state,
      windows,
      windowsObservedAt: latestWindows?.createdAt.toISOString(),
      lastError: lastProblem?.error || undefined,
      lastErrorAt: lastProblem?.createdAt.toISOString(),
    });

    // Account-wide free pool (OpenRouter): one extra row summing the free models.
    if (shared && isFreeModel(model) && !pools.has(providerId)) {
      const poolToday = rows.filter(
        (row) => row.providerId === providerId && isFreeModel(row.model) && row.createdAt >= dayStart,
      );
      const used = poolToday.filter((row) => countsAgainstQuota(row.status)).length;
      pools.set(providerId, {
        providerId,
        providerName,
        preset,
        model: "*",
        roles: [],
        freeTier: true,
        usedToday: used,
        tokensToday: poolToday.reduce((total, row) => total + tokensOf(row), 0),
        dayLimit: shared,
        dayLimitSource: "catalog",
        keys: 1,
        dayResetsAt: quotaDayEnd(preset, now).toISOString(),
        exhaustedUntil: used >= shared ? quotaDayEnd(preset, now).toISOString() : undefined,
        state: used >= shared ? "exhausted" : used >= shared * 0.8 ? "near" : "ok",
        windows: [],
      });
    }
  }
  limits.push(...pools.values());
  const rank = (entry: LimitStatus) =>
    entry.roles.includes("reader")
      ? 0
      : entry.roles.includes("translator")
        ? 1
        : entry.roles.length
          ? 2
          : entry.model === "*"
            ? 3
            : 4;
  limits.sort((a, b) => rank(a) - rank(b));

  // Pages left today: each stage can run on its model or its fallback.
  const remainingOf = (providerId: string, model: string) => {
    const entry = limits.find((item) => item.providerId === providerId && item.model === model);
    if (!entry) return undefined;
    if (entry.exhaustedUntil) return 0;
    const pool = isFreeModel(model) ? pools.get(providerId) : undefined;
    const own = entry.dayLimit !== undefined ? entry.dayLimit * entry.keys - entry.usedToday : undefined;
    const shared = pool ? pool.dayLimit! - pool.usedToday : undefined;
    if (own === undefined && shared === undefined) return undefined;
    return Math.max(0, Math.min(own ?? Infinity, shared ?? Infinity));
  };
  const stageRemaining = (main: typeof ai.reader, fallback?: typeof ai.reader) => {
    const values = [main, fallback].filter(Boolean).map((choice) => remainingOf(choice!.providerId, choice!.model));
    // Unknown limit on any model of the stage: that stage is not the bottleneck we can measure.
    if (values.some((value) => value === undefined)) return undefined;
    return values.reduce<number>((total, value) => total + (value || 0), 0);
  };
  const sameModel = ai.reader.providerId === ai.translator.providerId && ai.reader.model === ai.translator.model;
  const readerLeft = stageRemaining(ai.reader, ai.readerFallback);
  const translatorLeft = stageRemaining(ai.translator, ai.translatorFallback);
  let pagesLeftToday: number | null = null;
  let limitedBy: string | null = null;
  if (sameModel && readerLeft !== undefined) {
    pagesLeftToday = Math.floor(readerLeft / 2);
    limitedBy = ai.reader.model;
  } else {
    const candidates = [
      { left: readerLeft, model: ai.reader.model },
      { left: translatorLeft, model: ai.translator.model },
    ].filter((entry): entry is { left: number; model: string } => entry.left !== undefined);
    if (candidates.length) {
      const tightest = candidates.reduce((a, b) => (b.left < a.left ? b : a));
      pagesLeftToday = tightest.left;
      limitedBy = tightest.model;
    }
  }

  const problems: RecentProblem[] = inMonth
    .filter((row) => failed(row.status))
    .slice(0, 15)
    .map((row) => ({
      at: row.createdAt.toISOString(),
      providerName: row.providerName,
      model: row.model,
      stage: row.stage as AiStage,
      status: row.status as AiCallStatus,
      error: row.error || row.status,
    }));

  return {
    generatedAt: now.toISOString(),
    tracking: ready,
    trackingSince,
    today: totalsOf(inMonth.filter((row) => row.createdAt >= todayStart)),
    week: totalsOf(inMonth.filter((row) => row.createdAt >= weekStart)),
    month: totalsOf(inMonth),
    lifetime: { pages: lifetime?.pages || 0, costUsd: lifetime?.cost || 0 },
    daily,
    models,
    limits,
    capacity: { pagesLeftToday, limitedBy },
    problems,
  };
};
