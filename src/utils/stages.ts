import { PageJobSummary, ProcessedImage } from "../types";

export type StageState = "idle" | "queued" | "running" | "done" | "failed";

export interface PageStages {
  detect: StageState;
  translate: StageState;
  render: StageState;
}

export type PageTone = "neutral" | "accent" | "ok" | "warn" | "danger";

export interface PageStatusView {
  stages: PageStages;
  /** Short human label: "Ready", "Translating", "Queued", "Render failed"… */
  label: string;
  tone: PageTone;
  /** Error text to surface, when the last job failed. */
  error?: string;
  /** True while a job is queued or running. */
  active: boolean;
}

const ACTIVE_STAGES = new Set(["queued", "detecting", "translating", "rendering"]);

const all = (state: StageState): PageStages => ({
  detect: state,
  translate: state,
  render: state,
});

/**
 * Turns a page and its newest job into the three-stage view used by cards,
 * list rows and the queue panel. The job wins when it is active or failed;
 * otherwise the page status decides.
 */
export const describePageStatus = (
  image: ProcessedImage,
  job?: PageJobSummary | null,
): PageStatusView => {
  if (job && ACTIVE_STAGES.has(job.stage)) {
    if (job.waitingForWorker) {
      return {
        stages: all("queued"),
        label: "Waiting for OCR worker",
        tone: "warn",
        active: true,
        error: job.error,
      };
    }
    if (job.provider === "migration") {
      return {
        stages: { detect: "done", translate: "done", render: "running" },
        label: "Migrating",
        tone: "accent",
        active: true,
        error: job.error,
      };
    }
    switch (job.stage) {
      case "queued":
        return { stages: all("queued"), label: "Queued", tone: "warn", active: true, error: job.error };
      case "detecting":
        return {
          stages: { detect: "running", translate: "idle", render: "idle" },
          label: job.provider === "gemini_batch" ? "Detecting (batch)" : "Detecting",
          tone: "accent",
          active: true,
          error: job.error,
        };
      case "translating":
        return {
          stages: { detect: "done", translate: "running", render: "idle" },
          label: "Translating",
          tone: "accent",
          active: true,
          error: job.error,
        };
      case "rendering":
        return {
          stages: { detect: "done", translate: "done", render: "running" },
          label: "Rendering",
          tone: "accent",
          active: true,
          error: job.error,
        };
    }
  }

  if (job && job.stage === "failed" && image.status !== "completed") {
    return {
      stages: all("failed"),
      label: "Failed",
      tone: "danger",
      active: false,
      error: job.error,
    };
  }

  switch (image.status) {
    case "completed":
      return { stages: all("done"), label: "Ready", tone: "ok", active: false };
    case "error":
      return {
        stages: all("failed"),
        label: "Failed",
        tone: "danger",
        active: false,
        error: job?.error,
      };
    case "processing":
      // Status says processing but no live job: the page was queued from
      // another tab or the job list has not refreshed yet.
      return {
        stages: { detect: "running", translate: "idle", render: "idle" },
        label: "Processing",
        tone: "accent",
        active: true,
      };
    default:
      return { stages: all("idle"), label: "Not translated", tone: "neutral", active: false };
  }
};

/** Short label for a job stage, used in the queue panel. */
export const JOB_STAGE_LABELS: Record<PageJobSummary["stage"], string> = {
  queued: "Queued",
  detecting: "Detecting",
  translating: "Translating",
  rendering: "Rendering",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};
