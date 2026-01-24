import { useRef, useState } from "react";
import { GeminiService } from "../services/gemini";
import { useSeriesStore } from "../stores/useSeriesStore";
import { useSettingsStore } from "../stores/useSettingsStore";
import { ProcessedImage, UsageMetadata } from "../types";
import { createTranslatedImageBlob } from "../utils/image";
import { resolveImageUrl } from "../utils/url";

import {
  useSaveTranslatedImageMutation,
  useUpdateImageMutation,
} from "./useImageMutations";
import { useSeriesImagesQuery } from "./useSeriesQueries";

const INPUT_COST_PER_1K = 0.0005;
const OUTPUT_COST_PER_1K = 0.003;

export const useImageProcessor = () => {
  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const geminiService = useRef(new GeminiService());

  const activeSeriesId = useSeriesStore((state) => state.activeSeriesId);
  const { data: images } = useSeriesImagesQuery(activeSeriesId);

  const { mutateAsync: updateImageStatus } = useUpdateImageMutation();
  const { mutateAsync: saveTranslatedImageMutation } =
    useSaveTranslatedImageMutation();

  const { settings } = useSettingsStore();

  const calculateCost = (usage: UsageMetadata) => {
    const inputCost = (usage.promptTokenCount / 1000) * INPUT_COST_PER_1K;
    const outputCost = (usage.candidatesTokenCount / 1000) * OUTPUT_COST_PER_1K;
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
      );

      const tBlob = await createTranslatedImageBlob(
        image.originalUrl,
        bubbles,
        settings,
      );

      const cost = calculateCost(usage);

      // Persistence via Supabase/R2
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
        // Fallback or error state?
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

    // Use a copy to avoid mutating the original array and sort by sequenceNumber to maintain order
    const imagesToProcess = [...images]
      .filter((img) => img.status === "idle" || img.status === "error")
      .sort((a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0));

    const CHUNK_SIZE = 10;
    for (let i = 0; i < imagesToProcess.length; i += CHUNK_SIZE) {
      const chunk = imagesToProcess.slice(i, i + CHUNK_SIZE);
      // Process 10 images at once
      await Promise.all(chunk.map((image) => processImage(image)));
    }

    setIsProcessingAll(false);
  };

  return {
    processImage,
    processAll,
    isProcessingAll,
    // Helping function if needed externally
    urlToBase64,
  };
};
