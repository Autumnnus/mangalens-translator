import { catalogModel } from "@/lib/aiCatalog";
import { UsageBreakdown, UsageMetadata } from "../types";

/**
 * Cost of a page. New usage entries carry the price computed when the call
 * was made; older, Gemini-only entries are priced from the catalog (batch
 * calls at half price, as Gemini Batch billed them).
 */
const entryCost = (entry: UsageBreakdown) => {
  if (typeof entry.costUsd === "number") return entry.costUsd;
  const model = catalogModel(entry.model);
  if (!model) return 0;
  const discount = entry.billingMode === "batch" ? 0.5 : 1;
  return (
    ((entry.promptTokenCount * (model.inputPer1M || 0) +
      (entry.candidatesTokenCount + entry.thoughtsTokenCount) * (model.outputPer1M || 0)) /
      1_000_000) *
    discount
  );
};

export const calculateUsageCost = (usage: UsageMetadata) =>
  (usage.breakdown || []).reduce((total, entry) => total + entryCost(entry), 0);
