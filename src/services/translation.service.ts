import { PageJobSummary } from "@/types";

/** Client wrapper for the server-side page job model. */

export interface TranslatePageOptions {
  pipeline: "auto" | "gemini_vision" | "local_ocr";
  targetLanguage?: string;
  customInstructions?: string;
  model?: string;
  fallbackModel?: string;
  enableQualityFallback?: boolean;
}

export type TranslateRequestError = Error & { status?: number };

const parse = async <T>(response: Response, fallback: string): Promise<T> => {
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    const error = new Error(data.error || fallback) as TranslateRequestError;
    error.status = response.status;
    throw error;
  }
  return data;
};

/** Queues a page job; returns the job (existing one if the page is already running). */
export const startPageJob = (imageId: string, options: TranslatePageOptions) =>
  fetch(`/api/pages/${encodeURIComponent(imageId)}/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(options),
  }).then((response) =>
    parse<{ job: PageJobSummary; existing?: boolean }>(response, "Translation could not be queued"),
  );

export const listPageJobs = (seriesId: string) =>
  fetch(`/api/jobs?seriesId=${encodeURIComponent(seriesId)}`, {
    cache: "no-store",
    credentials: "same-origin",
  }).then((response) => parse<{ jobs: PageJobSummary[] }>(response, "Jobs could not be read"));

export const cancelPageJob = (jobId: string) =>
  fetch(`/api/jobs/${encodeURIComponent(jobId)}/cancel`, {
    method: "POST",
    credentials: "same-origin",
  }).then((response) => parse<{ job: PageJobSummary }>(response, "Job could not be cancelled"));

export const submitBatch = (seriesId: string, imageIds: string[]) =>
  fetch("/api/gemini/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ seriesId, imageIds }),
  }).then((response) =>
    parse<{ pageJobs: PageJobSummary[]; rejectedImageIds: string[] }>(
      response,
      "Gemini Batch job could not be created",
    ),
  );
