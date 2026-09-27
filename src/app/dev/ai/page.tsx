"use client";

import UsageModal from "@/components/ai/UsageModal";
import SettingsModal from "@/components/SettingsModal";
import { Button } from "@/components/ui";
import { aiUsageKeys } from "@/hooks/useAiUsage";
import { UsageSummary } from "@/lib/aiUsage";
import { TranslationSettings } from "@/types";
import { useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";

/**
 * Development harness for the AI usage and settings screens with fake data,
 * without a database or login.
 *
 *   /dev/ai
 */

const hours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
const day = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);

const SUMMARY: UsageSummary = {
  generatedAt: new Date().toISOString(),
  tracking: true,
  trackingSince: new Date(Date.now() - 12 * 86_400_000).toISOString(),
  today: {
    calls: 31,
    failed: 3,
    pages: 14,
    inputTokens: 168_000,
    outputTokens: 41_000,
    costUsd: 0.0021,
    savedUsd: 0.094,
  },
  week: {
    calls: 180,
    failed: 9,
    pages: 84,
    inputTokens: 1_010_000,
    outputTokens: 240_000,
    costUsd: 0.012,
    savedUsd: 0.51,
  },
  month: {
    calls: 402,
    failed: 21,
    pages: 190,
    inputTokens: 2_300_000,
    outputTokens: 540_000,
    costUsd: 0.21,
    savedUsd: 1.02,
  },
  lifetime: { pages: 1240, costUsd: 3.84 },
  daily: Array.from({ length: 30 }, (_, index) => {
    const offset = 29 - index;
    const calls = offset > 12 ? 0 : Math.round(10 + 25 * Math.abs(Math.sin(offset)));
    return {
      date: day(offset),
      calls,
      failed: offset % 4 === 0 ? Math.min(3, calls) : 0,
      pages: Math.round(calls / 2.2),
      tokens: calls * 7000,
      costUsd: calls * 0.0004,
    };
  }),
  models: [
    {
      providerId: "g",
      providerName: "Gemini",
      preset: "gemini",
      model: "gemini-3-flash-preview",
      stage: "reading",
      calls: 188,
      failed: 12,
      inputTokens: 2_100_000,
      outputTokens: 380_000,
      costUsd: 0,
      savedUsd: 0.98,
      avgDurationMs: 8400,
      lastUsedAt: hours(-0.2),
    },
    {
      providerId: "m",
      providerName: "Mistral",
      preset: "mistral",
      model: "mistral-large-latest",
      stage: "translation",
      calls: 190,
      failed: 2,
      inputTokens: 190_000,
      outputTokens: 150_000,
      costUsd: 0,
      savedUsd: 0.04,
      avgDurationMs: 3100,
      lastUsedAt: hours(-0.2),
    },
    {
      providerId: "m",
      providerName: "Mistral",
      preset: "mistral",
      model: "mistral-small-latest",
      stage: "reading",
      calls: 14,
      failed: 0,
      inputTokens: 160_000,
      outputTokens: 20_000,
      costUsd: 0,
      savedUsd: 0.03,
      avgDurationMs: 5200,
      lastUsedAt: hours(-1),
    },
    {
      providerId: "d",
      providerName: "DeepSeek",
      preset: "deepseek",
      model: "deepseek-chat",
      stage: "translation",
      calls: 10,
      failed: 7,
      inputTokens: 20_000,
      outputTokens: 10_000,
      costUsd: 0.21,
      savedUsd: 0,
      avgDurationMs: 4100,
      lastUsedAt: hours(-50),
    },
  ],
  limits: [
    {
      providerId: "g",
      providerName: "Gemini",
      preset: "gemini",
      model: "gemini-3-flash-preview",
      roles: ["reader"],
      freeTier: true,
      usedToday: 20,
      tokensToday: 160_000,
      dayLimit: 20,
      dayLimitSource: "provider",
      keys: 1,
      dayResetsAt: hours(6),
      exhaustedUntil: hours(6),
      state: "exhausted",
      windows: [],
      lastError: "Gemini: the daily quota of gemini-3-flash-preview is used up; it resets around 09:00 GMT+2.",
      lastErrorAt: hours(-0.3),
    },
    {
      providerId: "m",
      providerName: "Mistral",
      preset: "mistral",
      model: "mistral-large-latest",
      roles: ["translator"],
      freeTier: true,
      usedToday: 14,
      tokensToday: 22_000,
      keys: 1,
      dayResetsAt: hours(8),
      state: "ok",
      windows: [
        { unit: "requests", window: "minute", limit: 60, remaining: 59 },
        { unit: "tokens", window: "month", limit: 1_000_000_000, remaining: 998_700_000 },
      ],
      windowsObservedAt: hours(-0.2),
    },
    {
      providerId: "m",
      providerName: "Mistral",
      preset: "mistral",
      model: "mistral-small-latest",
      roles: ["readerFallback"],
      freeTier: true,
      usedToday: 3,
      tokensToday: 30_000,
      keys: 1,
      dayResetsAt: hours(8),
      state: "ok",
      windows: [],
    },
    {
      providerId: "g",
      providerName: "Gemini",
      preset: "gemini",
      model: "gemini-3.1-flash-lite",
      roles: ["translatorFallback"],
      freeTier: true,
      usedToday: 16,
      tokensToday: 20_000,
      dayLimit: 20,
      dayLimitSource: "catalog",
      keys: 2,
      dayResetsAt: hours(6),
      state: "ok",
      windows: [],
    },
  ],
  capacity: { pagesLeftToday: null, limitedBy: null },
  problems: [
    {
      at: hours(-0.3),
      providerName: "Gemini",
      model: "gemini-3-flash-preview",
      stage: "reading",
      status: "quota_exhausted",
      error:
        "You exceeded your current quota. Quota exceeded for metric: generate_content_free_tier_requests, limit: 20, model: gemini-3-flash",
    },
    {
      at: hours(-3),
      providerName: "Mistral",
      model: "mistral-large-latest",
      stage: "translation",
      status: "rate_limited",
      error: "429: Requests rate limit exceeded",
    },
    {
      at: hours(-50),
      providerName: "DeepSeek",
      model: "deepseek-chat",
      stage: "translation",
      status: "error",
      error: "402: Insufficient Balance",
    },
  ],
};

const SETTINGS: TranslationSettings = {
  targetLanguage: "Turkish",
  customInstructions: "",
  ai: {
    providers: [
      {
        id: "system-gemini",
        name: "Gemini (server key)",
        preset: "gemini",
        kind: "gemini",
        apiKeys: [],
        freeTier: true,
      },
      {
        id: "m",
        name: "Mistral",
        preset: "mistral",
        kind: "openai",
        baseUrl: "https://api.mistral.ai/v1",
        apiKeys: ["mistral-test-key-1234"],
        freeTier: true,
      },
      {
        id: "d",
        name: "DeepSeek",
        preset: "deepseek",
        kind: "openai",
        baseUrl: "https://api.deepseek.com/v1",
        apiKeys: [],
      },
    ],
    reader: { providerId: "system-gemini", model: "gemini-3-flash-preview" },
    translator: { providerId: "m", model: "mistral-large-latest" },
    readerFallback: { providerId: "m", model: "mistral-small-latest" },
  },
};

export default function DevAiPage() {
  const queryClient = useQueryClient();
  const [ready] = useState(() => {
    // Mock data must never reach a real session's query cache.
    if (process.env.NODE_ENV === "production") return false;
    queryClient.setQueryData(aiUsageKeys.summary, SUMMARY);
    queryClient.setQueryDefaults(aiUsageKeys.summary, { staleTime: Infinity, refetchInterval: false });
    return true;
  });
  const [usageOpen, setUsageOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  if (!ready) return null;
  return (
    <main className="flex min-h-screen items-start gap-2 bg-paper p-6">
      <Button onClick={() => setUsageOpen(true)}>Usage</Button>
      <Button onClick={() => setSettingsOpen(true)}>Settings</Button>
      <UsageModal open={usageOpen} onClose={() => setUsageOpen(false)} />
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} settings={SETTINGS} />
    </main>
  );
}
