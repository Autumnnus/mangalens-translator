import { useRef, useState } from "react";
import { GeminiService } from "../services/gemini";
import { useSeriesStore } from "../stores/useSeriesStore";
import { useSettingsStore } from "../stores/useSettingsStore";
import { GEMINI_MODELS, ProcessedImage, UsageMetadata } from "../types";
import { createTranslatedImageBlob } from "../utils/image";
import { resolveImageUrl } from "../utils/url";

import { useQueryClient } from "@tanstack/react-query";
import {
  useSaveTranslatedImageMutation,
  useUpdateImageMutation,
} from "./useImageMutations";
import { seriesKeys, useSeriesImagesQuery } from "./useSeriesQueries";

export const useImageProcessor = () => {
  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const geminiService = useRef(new GeminiService());

  const activeSeriesId = useSeriesStore((state) => state.activeSeriesId);
  const { data: images } = useSeriesImagesQuery(activeSeriesId);

  const queryClient = useQueryClient();
  const { mutateAsync: updateImageStatus } = useUpdateImageMutation();
  const { mutateAsync: saveTranslatedImageMutation } =
    useSaveTranslatedImageMutation();

  const { settings } = useSettingsStore();

  const calculateCost = (usage: UsageMetadata, modelId: string) => {
    const model =
      GEMINI_MODELS.find((m) => m.id === modelId) || GEMINI_MODELS[0];
    const inputCost = (usage.promptTokenCount / 1000) * model.inputCostPer1k;
    const outputCost =
      (usage.candidatesTokenCount / 1000) * model.outputCostPer1k;
    return inputCost + outputCost;
  };

  const urlToBase64 = async (url: string): Promise<string> => {
    const response = await fetch(resolveImageUrl(url));
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const base64 = result.includes(",") ? result.split(",")[1] : result;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const processImage = async (
    image: ProcessedImage,
    retryCount = 0,
  ): Promise<boolean> => {
    if (!activeSeriesId) return false;

    // Optimistic update to UI
    queryClient.setQueryData<ProcessedImage[]>(
      seriesKeys.images(activeSeriesId),
      (old) =>
        old?.map((img) =>
          img.id === image.id ? { ...img, status: "processing" } : img,
        ) || [],
    );

    await updateImageStatus({
      seriesId: activeSeriesId,
      imageId: image.id,
      updates: { status: "processing" },
    });

    try {
      const base64 = await urlToBase64(image.originalUrl);
      const { bubbles, usage } = await geminiService.current.translateImage(
        base64,
        settings.targetLanguage,
        settings.customInstructions,
        settings.model,
        settings.useCustomApiKey ? settings.customApiKey : undefined,
      );

      const tBlob = await createTranslatedImageBlob(
        image.originalUrl,
        bubbles,
        settings,
      );

      const cost = calculateCost(usage, settings.model);

      try {
        await saveTranslatedImageMutation({
          seriesId: activeSeriesId,
          imageId: image.id,
          blob: tBlob,
          fileName: image.fileName,
          meta: { bubbles, usage, cost },
        });
      } catch (e) {
        console.error("Failed to save translated image", e);
      }

      return true;
    } catch (error) {
      const errorStr = (
        error instanceof Error ? error.message : String(error)
      ).toLowerCase();
      const isRateLimit =
        errorStr.includes("429") ||
        errorStr.includes("limit") ||
        errorStr.includes("quota");

      if (isRateLimit && retryCount < 8) {
        const backoff = Math.pow(2, retryCount) * 2000;
        await new Promise((r) => setTimeout(r, backoff));
        return processImage(image, retryCount + 1);
      }

      console.error("Processing failed for", image.fileName, error);
      await updateImageStatus({
        seriesId: activeSeriesId,
        imageId: image.id,
        updates: { status: "error" },
      });
      return false;
    }
  };

  const processAll = async () => {
    if (!images || !images.length) return;

    setIsProcessingAll(true);

    const imagesToProcess = [...images]
      .filter((img) => img.status === "idle" || img.status === "error")
      .sort((a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0));

    const CHUNK_SIZE = Math.min(settings.batchSize || 10, 10);
    const DELAY = settings.batchDelay || 0;

    for (let i = 0; i < imagesToProcess.length; i += CHUNK_SIZE) {
      const chunk = imagesToProcess.slice(i, i + CHUNK_SIZE);
      await Promise.all(chunk.map((image) => processImage(image)));

      // Delay between batches to respect rate limits if configured
      if (DELAY > 0 && i + CHUNK_SIZE < imagesToProcess.length) {
        await new Promise((r) => setTimeout(r, DELAY));
      }
    }

    // Invalidate everything at once at the end
    if (activeSeriesId) {
      queryClient.invalidateQueries({
        queryKey: seriesKeys.images(activeSeriesId),
      });
    }
    queryClient.invalidateQueries({ queryKey: seriesKeys.lists() });

    setIsProcessingAll(false);
  };

  return {
    processImage,
    processAll,
    isProcessingAll,
    urlToBase64,
  };
};
