import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import {
  cancelPageJob,
  startPageJob,
} from "../services/translation.service";
import { useSeriesStore } from "../stores/useSeriesStore";
import { useSettingsStore } from "../stores/useSettingsStore";
import { useUIStore } from "../stores/useUIStore";
import { ProcessedImage } from "../types";
import { jobKeys, usePageJobs } from "./usePageJobs";
import { seriesKeys, useSeriesImagesQuery } from "./useSeriesQueries";

/**
 * Starts and cancels page jobs. All work (detection, translation, cleaning,
 * typesetting, upload, retries) runs on the server; progress arrives through
 * the polled job list, so nothing here waits for a page to finish.
 */
export const useImageProcessor = () => {
  const activeSeriesId = useSeriesStore((state) => state.activeSeriesId);
  const { data: images } = useSeriesImagesQuery(activeSeriesId);
  const { byImage, hasActive, refetch } = usePageJobs(activeSeriesId);
  const queryClient = useQueryClient();
  const showToast = useUIStore((state) => state.showToast);
  const { settings } = useSettingsStore();

  const refresh = useCallback(
    (seriesId: string) => {
      queryClient.invalidateQueries({ queryKey: jobKeys.series(seriesId) });
      queryClient.invalidateQueries({ queryKey: seriesKeys.images(seriesId) });
    },
    [queryClient],
  );

  const jobOptions = useCallback(
    () => ({
      targetLanguage: settings.targetLanguage,
      customInstructions: settings.customInstructions,
    }),
    [settings],
  );

  /** Queues one page. Resolves true when the job was accepted. */
  const processImage = useCallback(
    async (image: ProcessedImage, _retryCount = 0, _isManual = false): Promise<boolean> => {
      if (!activeSeriesId) return false;
      queryClient.setQueryData<ProcessedImage[]>(seriesKeys.images(activeSeriesId), (old) =>
        old?.map((img) => (img.id === image.id ? { ...img, status: "processing" } : img)) || [],
      );
      try {
        const { existing } = await startPageJob(image.id, jobOptions());
        if (existing) {
          showToast(`${image.fileName}: already in progress.`, "info", 3000);
        }
        refresh(activeSeriesId);
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown translation error";
        showToast(`${image.fileName}: ${message}`, "error", 6500);
        refresh(activeSeriesId);
        return false;
      }
    },
    [activeSeriesId, jobOptions, queryClient, refresh, showToast],
  );

  const cancelProcessing = useCallback(
    async (imageId: string) => {
      if (!activeSeriesId) return;
      const job = byImage.get(imageId);
      if (!job) return;
      try {
        await cancelPageJob(job.id);
      } catch (error) {
        console.error("Failed to cancel processing", error);
      }
      refresh(activeSeriesId);
    },
    [activeSeriesId, byImage, refresh],
  );

  /** Queues every page that is not completed. The server processes them in order. */
  const processAll = useCallback(async () => {
    if (!activeSeriesId || !images || images.length === 0) return;
    const pending = images.filter(
      (img) => img.status !== "completed" && !byImage.get(img.id)?.stage.match(/queued|detecting|translating|rendering/),
    );
    if (pending.length === 0) {
      showToast("Every page is already translated.", "info", 4000);
      return;
    }

    let queued = 0;
    for (const image of pending) {
      if (await processImage(image)) queued += 1;
    }
    showToast(
      `${queued}/${pending.length} pages queued. The server keeps working if you close this tab.`,
      queued === pending.length ? "success" : "info",
      6000,
    );
    refresh(activeSeriesId);
    void refetch();
  }, [activeSeriesId, byImage, images, processImage, refetch, refresh, showToast]);

  return { processImage, processAll, cancelProcessing, isProcessingAll: hasActive };
};
