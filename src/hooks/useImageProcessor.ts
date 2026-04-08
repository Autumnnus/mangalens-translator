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
import { useUIStore } from "../stores/useUIStore";

const MAX_RETRY_ATTEMPTS = 6;
const RETRY_INTERVAL_MS = 5000;

export const useImageProcessor = () => {
  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const geminiService = useRef(new GeminiService());
  const abortControllers = useRef<Map<string, AbortController>>(new Map());

  const activeSeriesId = useSeriesStore((state) => state.activeSeriesId);
  const { data: images } = useSeriesImagesQuery(activeSeriesId);

  const queryClient = useQueryClient();
  const { mutateAsync: updateImageStatus } = useUpdateImageMutation();
  const { mutateAsync: saveTranslatedImageMutation } =
    useSaveTranslatedImageMutation();
  const showToast = useUIStore((state) => state.showToast);

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

  const parseStatusCode = (error: unknown): number | null => {
    if (!error || typeof error !== "object") return null;
    const candidate = error as Record<string, unknown>;

    const direct = candidate.status ?? candidate.code;
    if (typeof direct === "number") return direct;
    if (typeof direct === "string") {
      const parsed = Number.parseInt(direct, 10);
      if (!Number.isNaN(parsed)) return parsed;
    }

    const nested = candidate.error;
    if (nested && typeof nested === "object") {
      const nestedCode = (nested as Record<string, unknown>).code;
      if (typeof nestedCode === "number") return nestedCode;
      if (typeof nestedCode === "string") {
        const parsed = Number.parseInt(nestedCode, 10);
        if (!Number.isNaN(parsed)) return parsed;
      }
    }

    return null;
  };

  const isRetryableGeminiError = (error: unknown): boolean => {
    const statusCode = parseStatusCode(error);
    if (statusCode === 429 || statusCode === 503) return true;

    const message = (
      error instanceof Error ? error.message : String(error)
    ).toLowerCase();
    return (
      message.includes("429") ||
      message.includes("503") ||
      message.includes("too many requests") ||
      message.includes("service unavailable") ||
      message.includes("quota") ||
      message.includes("rate limit")
    );
  };

  const processImage = async (
    image: ProcessedImage,
    retryCount = 0,
    isManual = false,
  ): Promise<boolean> => {
    if (!activeSeriesId) return false;

    // If already processing, check if we should allow a manual restart
    if (
      !isManual &&
      image.status === "processing" &&
      abortControllers.current.has(image.id)
    ) {
      return false;
    }

    // Cancel existing processing if any
    const existingController = abortControllers.current.get(image.id);
    if (existingController) {
      existingController.abort();
    }

    const controller = new AbortController();
    abortControllers.current.set(image.id, controller);

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
      if (controller.signal.aborted) return false;

      const base64 = await urlToBase64(image.originalUrl);

      if (controller.signal.aborted) return false;

      const { bubbles, usage } = await geminiService.current.translateImage(
        base64,
        settings.targetLanguage,
        settings.customInstructions,
        settings.model,
      );

      if (controller.signal.aborted) return false;

      const tBlob = await createTranslatedImageBlob(
        image.originalUrl,
        bubbles,
        settings,
      );

      if (controller.signal.aborted) return false;

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
        if (controller.signal.aborted) return false;
        console.error("Failed to save translated image", e);
        throw e;
      }

      abortControllers.current.delete(image.id);
      return true;
    } catch (error) {
      if (controller.signal.aborted) {
        console.log("Processing aborted for", image.id);
        return false;
      }

      const isRetryable = isRetryableGeminiError(error);

      if (isRetryable && retryCount < MAX_RETRY_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, RETRY_INTERVAL_MS));
        if (controller.signal.aborted) return false;
        return processImage(image, retryCount + 1, isManual);
      }

      console.error("Processing failed for", image.fileName, error);
      abortControllers.current.delete(image.id);
      await updateImageStatus({
        seriesId: activeSeriesId,
        imageId: image.id,
        updates: { status: "error" },
      });

      const finalErrorMessage =
        error instanceof Error ? error.message : "Unknown translation error";

      if (isRetryable) {
        showToast(
          `${image.fileName}: Gemini yoğunluğu nedeniyle çeviri başarısız oldu. ${MAX_RETRY_ATTEMPTS + 1} deneme tamamlandı.`,
          "error",
          6500,
        );
      } else {
        showToast(`${image.fileName}: ${finalErrorMessage}`, "error", 6500);
      }

      return false;
    }
  };

  const cancelProcessing = async (imageId: string) => {
    const controller = abortControllers.current.get(imageId);
    if (controller) {
      controller.abort();
      abortControllers.current.delete(imageId);
    }

    if (activeSeriesId) {
      // Optimistic update
      queryClient.setQueryData<ProcessedImage[]>(
        seriesKeys.images(activeSeriesId),
        (old) =>
          old?.map((img) =>
            img.id === imageId ? { ...img, status: "error" } : img,
          ) || [],
      );

      try {
        await updateImageStatus({
          seriesId: activeSeriesId,
          imageId: imageId,
          updates: { status: "error" },
        });
      } catch (error) {
        console.error("Failed to cancel processing", error);
      }
    }
  };

  const processAll = async () => {
    if (!activeSeriesId || !images || !images.length) return;

    setIsProcessingAll(true);

    try {
      const response = await fetch("/api/gemini/translate-all", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          seriesId: activeSeriesId,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string }).error || "Failed to start background translation",
        );
      }

      // Refresh once so the UI picks up queued/processing state.
      queryClient.invalidateQueries({
        queryKey: seriesKeys.images(activeSeriesId),
      });
      queryClient.invalidateQueries({ queryKey: seriesKeys.lists() });
    } finally {
      setIsProcessingAll(false);
    }
  };

  return {
    processImage,
    processAll,
    cancelProcessing,
    isProcessingAll,
    urlToBase64,
  };
};
