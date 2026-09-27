import { UsageBreakdown, UsageMetadata } from "@/types";

/** Sums a page's calls into the stored usage document. */
export const combineUsage = (entries: UsageBreakdown[], modelUsed: string, fallbackUsed: boolean): UsageMetadata => ({
  promptTokenCount: entries.reduce((total, entry) => total + entry.promptTokenCount, 0),
  candidatesTokenCount: entries.reduce((total, entry) => total + entry.candidatesTokenCount, 0),
  thoughtsTokenCount: entries.reduce((total, entry) => total + entry.thoughtsTokenCount, 0),
  totalTokenCount: entries.reduce((total, entry) => total + entry.totalTokenCount, 0),
  breakdown: entries,
  modelUsed,
  fallbackUsed,
});
