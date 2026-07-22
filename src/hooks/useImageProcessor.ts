import { useRef, useState } from "react";
import { GeminiService } from "../services/gemini";
import { useSeriesStore } from "../stores/useSeriesStore";
import { useSettingsStore } from "../stores/useSettingsStore";
import {
  BatchTranslationItemResult,
  BatchTranslationJobSummary,
  ProcessedImage,
} from "../types";
import { calculateGeminiCost } from "../utils/cost";
import { createTranslatedImageBlob } from "../utils/image";
import { resolveImageUrl } from "../utils/url";

import { useQueryClient } from "@tanstack/react-query";
import { useUIStore } from "../stores/useUIStore";
import {
  useSaveTranslatedImageMutation,
  useUpdateImageMutation,
} from "./useImageMutations";
import { seriesKeys, useSeriesImagesQuery } from "./useSeriesQueries";

const MAX_RETRY_ATTEMPTS = 6;
const RETRY_INTERVAL_MS = 5000;
const BATCH_POLL_INTERVAL_MS = 5000;
const MAX_BATCH_POLL_ATTEMPTS = 120;

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

  const urlToImageInput = async (
    url: string,
  ): Promise<{ base64: string; mimeType: string }> => {
    const response = await fetch(resolveImageUrl(url));
    if (!response.ok) throw new Error("Original image could not be downloaded");
    const blob = await response.blob();
    const rawMimeType = (blob.type || response.headers.get("content-type") || "")
      .split(";", 1)[0]
      .toLowerCase();
    const mimeType = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
    ].includes(rawMimeType)
      ? rawMimeType
      : "image/jpeg";

    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result.includes(",") ? result.split(",")[1] : result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    return { base64, mimeType };
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

      const imageInput = await urlToImageInput(image.originalUrl);

      if (controller.signal.aborted) return false;

      const { bubbles, usage } = await geminiService.current.translateImage(
        imageInput.base64,
        imageInput.mimeType,
        settings.targetLanguage,
        settings.customInstructions,
        settings.model,
        settings.fallbackModel,
        settings.enableQualityFallback,
      );

      if (controller.signal.aborted) return false;

      const rendered = await createTranslatedImageBlob(
        image.originalUrl,
        bubbles,
        settings,
      );

      if (controller.signal.aborted) return false;

      const cost = calculateGeminiCost(usage, settings.model);

      try {
        await saveTranslatedImageMutation({
          seriesId: activeSeriesId,
          imageId: image.id,
          blob: rendered.blob,
          fileName: image.fileName,
          meta: { bubbles: rendered.bubbles, usage, cost },
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

  const getBatchJobs = async (seriesId: string) => {
    const response = await fetch(
      `/api/gemini/batch?seriesId=${encodeURIComponent(seriesId)}`,
      { cache: "no-store" },
    );
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new Error(
        data.error ||
          "Existing Gemini Batch jobs could not be read; no new jobs were submitted",
      );
    }
    const data = (await response.json()) as {
      jobs?: BatchTranslationJobSummary[];
    };
    return data.jobs || [];
  };

  const submitBatchJobs = async (seriesId: string, imageIds: string[]) => {
    const jobs: BatchTranslationJobSummary[] = [];
    const rejectedImageIds: string[] = [];
    const chunkSize = Math.min(10, Math.max(1, settings.batchSize || 10));

    for (let index = 0; index < imageIds.length; index += chunkSize) {
      const chunk = imageIds.slice(index, index + chunkSize);
      const response = await fetch("/api/gemini/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seriesId, imageIds: chunk }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        if (jobs.length > 0) {
          rejectedImageIds.push(...imageIds.slice(index));
          console.warn(
            "Some Gemini Batch chunks were not submitted",
            data.error,
          );
          break;
        }
        throw new Error(data.error || "Gemini Batch job could not be created");
      }
      const submitted = (await response.json()) as {
        jobs: BatchTranslationJobSummary[];
        rejectedImageIds: string[];
      };
      jobs.push(...submitted.jobs);
      rejectedImageIds.push(...submitted.rejectedImageIds);
    }

    return { jobs, rejectedImageIds };
  };

  const pollBatchJob = async (initialJob: BatchTranslationJobSummary) => {
    let job = initialJob;
    for (
      let attempt = 0;
      attempt < MAX_BATCH_POLL_ATTEMPTS;
      attempt += 1
    ) {
      if (job.status === "completed" || job.status === "failed") return job;
      if (attempt > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, BATCH_POLL_INTERVAL_MS),
        );
      }
      const response = await fetch(
        `/api/gemini/batch?jobId=${encodeURIComponent(job.id)}`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error || "Gemini Batch status could not be read");
      }
      const data = (await response.json()) as {
        job: BatchTranslationJobSummary;
      };
      job = data.job;
    }
    return job;
  };

  const saveBatchResult = async (
    result: BatchTranslationItemResult,
    image: ProcessedImage,
  ) => {
    if (!activeSeriesId || result.error) return false;
    const rendered = await createTranslatedImageBlob(
      image.originalUrl,
      result.bubbles,
      settings,
    );
    const cost = calculateGeminiCost(result.usage, settings.model);
    await saveTranslatedImageMutation({
      seriesId: activeSeriesId,
      imageId: image.id,
      blob: rendered.blob,
      fileName: image.fileName,
      meta: { bubbles: rendered.bubbles, usage: result.usage, cost },
    });
    return true;
  };

  const processAllWithGeminiBatch = async (pendingImages: ProcessedImage[]) => {
    if (!activeSeriesId) return { successCount: 0, deferredCount: 0 };
    const pendingById = new Map(pendingImages.map((image) => [image.id, image]));
    let jobs = (await getBatchJobs(activeSeriesId)).filter((job) =>
      job.imageIds.some((id) => pendingById.has(id)),
    );
    const coveredIds = new Set(jobs.flatMap((job) => job.imageIds));
    const toSubmit = pendingImages
      .filter((image) => !coveredIds.has(image.id))
      .map((image) => image.id);
    const directFallbackIds = new Set<string>();

    if (toSubmit.length > 0) {
      try {
        const submitted = await submitBatchJobs(activeSeriesId, toSubmit);
        jobs = [...jobs, ...submitted.jobs];
        submitted.rejectedImageIds.forEach((id) => directFallbackIds.add(id));
      } catch (error) {
        console.warn("Gemini Batch unavailable; using interactive fallback", error);
        toSubmit.forEach((id) => directFallbackIds.add(id));
      }
    }

    queryClient.invalidateQueries({
      queryKey: seriesKeys.images(activeSeriesId),
    });

    const successfulIds = new Set<string>();
    const deferredIds = new Set<string>();
    for (const queuedJob of jobs) {
      let completedJob: BatchTranslationJobSummary;
      try {
        completedJob = await pollBatchJob(queuedJob);
      } catch (error) {
        console.error("Batch polling failed", error);
        // The provider job may still be running. Retrying interactively here
        // could translate and bill the same page twice.
        queuedJob.imageIds.forEach((id) => {
          if (pendingById.has(id)) deferredIds.add(id);
        });
        continue;
      }

      if (
        completedJob.status !== "completed" ||
        !completedJob.results
      ) {
        if (completedJob.status === "failed") {
          completedJob.imageIds.forEach((id) => directFallbackIds.add(id));
        } else {
          completedJob.imageIds.forEach((id) => {
            if (pendingById.has(id)) deferredIds.add(id);
          });
        }
        continue;
      }

      for (const result of completedJob.results) {
        const image = pendingById.get(result.imageId);
        if (!image || result.error) {
          if (image) directFallbackIds.add(image.id);
          continue;
        }
        try {
          if (await saveBatchResult(result, image)) {
            successfulIds.add(image.id);
            directFallbackIds.delete(image.id);
            deferredIds.delete(image.id);
          }
        } catch (error) {
          console.error("Failed to render Batch result", error);
          // Translation already succeeded and was billed. Do not call Gemini
          // again for a local rendering/storage failure.
          await updateImageStatus({
            seriesId: activeSeriesId,
            imageId: image.id,
            updates: { status: "error" },
          }).catch((statusError) => {
            console.error("Failed to mark Batch render error", statusError);
          });
          showToast(
            `${image.fileName}: Çeviri tamamlandı ancak görsel kaydedilemedi.`,
            "error",
            6500,
          );
        }
      }
    }

    for (const imageId of directFallbackIds) {
      const image = pendingById.get(imageId);
      if (!image) continue;
      if (await processImage(image, 0, true)) {
        successfulIds.add(image.id);
        deferredIds.delete(image.id);
      }
    }

    return {
      successCount: successfulIds.size,
      deferredCount: deferredIds.size,
    };
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
    if (isProcessingAll) return;

    const pendingImages = images.filter((img) => img.status !== "completed");

    if (pendingImages.length === 0) {
      showToast("No non-completed images found to process.", "info", 4000);
      return;
    }

    setIsProcessingAll(true);
    showToast(
      `Translate All started in client background (${pendingImages.length} images).`,
      "info",
      6000,
    );

    try {
      let successCount = 0;
      let deferredCount = 0;

      if (settings.useGeminiBatch) {
        const result = await processAllWithGeminiBatch(pendingImages);
        successCount = result.successCount;
        deferredCount = result.deferredCount;
      } else {
        for (const image of pendingImages) {
          const succeeded = await processImage(image, 0, true);
          if (succeeded) successCount += 1;

          if (settings.batchDelay && settings.batchDelay > 0) {
            await new Promise((resolve) =>
              setTimeout(resolve, settings.batchDelay),
            );
          }
        }
      }

      if (deferredCount > 0) {
        showToast(
          `Gemini Batch is still running for ${deferredCount} images. Click Translate All later to resume without duplicate billing.`,
          "info",
          7000,
        );
      } else {
        showToast(
          `Translate All completed. Success: ${successCount}/${pendingImages.length}`,
          successCount === pendingImages.length ? "success" : "info",
          5500,
        );
      }

      queryClient.invalidateQueries({
        queryKey: seriesKeys.images(activeSeriesId),
      });
      queryClient.invalidateQueries({ queryKey: seriesKeys.lists() });
    } catch (error) {
      console.error("Translate all failed on client", error);
      showToast("Translate All failed on client side.", "error", 5000);
    } finally {
      setIsProcessingAll(false);
    }
  };

  return {
    processImage,
    processAll,
    cancelProcessing,
    isProcessingAll,
    urlToBase64: async (url: string) => (await urlToImageInput(url)).base64,
  };
};
