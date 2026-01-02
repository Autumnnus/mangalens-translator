import { useRef, useState } from "react";
import { GeminiService } from "../services/gemini";
import { useSeriesStore } from "../stores/useSeriesStore";
import { useSettingsStore } from "../stores/useSettingsStore";
import { ProcessedImage, UsageMetadata } from "../types";
import { imageDb } from "../utils/db";
import { createTranslatedImage } from "../utils/image";

const INPUT_COST_PER_1K = 0.0005;
const OUTPUT_COST_PER_1K = 0.003;

export const useImageProcessor = () => {
  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const geminiService = useRef(new GeminiService());

  const { series, activeSeriesId, updateImageInSeries } = useSeriesStore();
  const { settings } = useSettingsStore();

  const activeSeries = series.find((s) => s.id === activeSeriesId);
  const images = activeSeries?.images || [];

  const calculateCost = (usage: UsageMetadata) => {
    const inputCost = (usage.promptTokenCount / 1000) * INPUT_COST_PER_1K;
    const outputCost = (usage.candidatesTokenCount / 1000) * OUTPUT_COST_PER_1K;
    return inputCost + outputCost;
  };

  const urlToBase64 = async (url: string): Promise<string> => {
    const response = await fetch(url);
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
    retryCount = 0
  ): Promise<boolean> => {
    if (!activeSeriesId) return false;

    updateImageInSeries(activeSeriesId, image.id, { status: "processing" });

    try {
      const base64 = await urlToBase64(image.originalUrl);
      const { bubbles, usage } = await geminiService.current.translateImage(
        base64,
        settings.targetLanguage
      );

      const translatedUrl = await createTranslatedImage(
        image.originalUrl,
        bubbles,
        settings
      );

      const cost = calculateCost(usage);

      // Persistence
      let finalTranslatedUrl = translatedUrl;
      try {
        const tRes = await fetch(translatedUrl);
        const tBlob = await tRes.blob();
        await imageDb.saveImage(image.id, "translated", tBlob);

        if (translatedUrl.startsWith("data:")) {
          finalTranslatedUrl = URL.createObjectURL(tBlob);
        }
      } catch (e) {
        console.error("Failed to save translated image to DB", e);
      }

      updateImageInSeries(activeSeriesId, image.id, {
        status: "completed",
        bubbles,
        translatedUrl: finalTranslatedUrl,
        usage,
        cost,
      });

      return true;
    } catch (error: any) {
      const errorStr = (error?.message || "").toLowerCase();
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
      updateImageInSeries(activeSeriesId, image.id, { status: "error" });
      return false;
    }
  };

  const processAll = async () => {
    if (!images.length) return;

    setIsProcessingAll(true);
    for (const image of images) {
      if (image.status === "idle" || image.status === "error") {
        await processImage(image);
      }
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
