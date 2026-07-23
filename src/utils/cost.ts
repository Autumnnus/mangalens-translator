import { GEMINI_MODELS, UsageBreakdown, UsageMetadata } from "../types";

const getModel = (modelId: string) =>
  GEMINI_MODELS.find((model) => model.id === modelId) || GEMINI_MODELS[0];

const calculateEntryCost = (entry: UsageBreakdown) => {
  const model = getModel(entry.model);
  const isBatch = entry.billingMode === "batch";
  const inputRate = isBatch
    ? model.batchInputCostPer1k
    : model.inputCostPer1k;
  const outputRate = isBatch
    ? model.batchOutputCostPer1k
    : model.outputCostPer1k;

  return (
    (entry.promptTokenCount / 1000) * inputRate +
    ((entry.candidatesTokenCount + entry.thoughtsTokenCount) / 1000) *
      outputRate
  );
};

export const calculateGeminiCost = (
  usage: UsageMetadata,
  fallbackModelId: string,
) => {
  if (usage.breakdown && usage.breakdown.length > 0) {
    return usage.breakdown.reduce(
      (total, entry) => total + calculateEntryCost(entry),
      0,
    );
  }

  const inferredThoughts = Math.max(
    0,
    usage.totalTokenCount -
      usage.promptTokenCount -
      usage.candidatesTokenCount,
  );

  return calculateEntryCost({
    model: usage.modelUsed || fallbackModelId,
    billingMode: "standard",
    promptTokenCount: usage.promptTokenCount,
    candidatesTokenCount: usage.candidatesTokenCount,
    thoughtsTokenCount: usage.thoughtsTokenCount ?? inferredThoughts,
    totalTokenCount: usage.totalTokenCount,
  });
};

