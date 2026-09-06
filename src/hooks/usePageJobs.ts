import { listPageJobs } from "@/services/translation.service";
import { PageJobStage, PageJobSummary } from "@/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { seriesKeys } from "./useSeriesQueries";

const ACTIVE: PageJobStage[] = ["queued", "detecting", "translating", "rendering"];
export const isActiveJob = (job: PageJobSummary) => ACTIVE.includes(job.stage);

export const jobKeys = {
  series: (seriesId: string) => ["page-jobs", seriesId] as const,
};

/**
 * Polls the page jobs of a series while any is active, and refreshes the
 * image list whenever a job reaches a terminal stage.
 */
export const usePageJobs = (seriesId: string | null) => {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: jobKeys.series(seriesId || ""),
    queryFn: () => listPageJobs(seriesId!).then((data) => data.jobs),
    enabled: !!seriesId,
    refetchInterval: (state) => {
      const jobs = state.state.data;
      return jobs && jobs.some(isActiveJob) ? 3000 : false;
    },
    refetchOnWindowFocus: true,
    staleTime: 1000,
  });

  const jobs = useMemo(() => query.data || [], [query.data]);

  const byImage = useMemo(() => {
    const map = new Map<string, PageJobSummary>();
    for (const job of jobs) {
      // Newest job per image wins (list is newest first).
      if (!map.has(job.imageId)) map.set(job.imageId, job);
    }
    return map;
  }, [jobs]);

  const activeJobs = useMemo(() => jobs.filter(isActiveJob), [jobs]);

  // Refresh images when a job finishes.
  const previousActive = useRef<Set<string>>(new Set());
  useEffect(() => {
    const current = new Set(activeJobs.map((job) => job.id));
    let finished = false;
    for (const id of previousActive.current) {
      if (!current.has(id)) finished = true;
    }
    previousActive.current = current;
    if (finished && seriesId) {
      queryClient.invalidateQueries({ queryKey: seriesKeys.images(seriesId) });
      queryClient.invalidateQueries({ queryKey: seriesKeys.lists() });
    }
  }, [activeJobs, queryClient, seriesId]);

  return {
    jobs,
    byImage,
    activeJobs,
    hasActive: activeJobs.length > 0,
    refetch: query.refetch,
  };
};

export const STAGE_LABELS: Record<PageJobStage, string> = {
  queued: "Sırada",
  detecting: "Tespit",
  translating: "Çeviri",
  rendering: "Render",
  completed: "Tamamlandı",
  failed: "Hata",
  cancelled: "İptal",
};

export const describeJob = (job: PageJobSummary) => {
  if (job.waitingForWorker) return "OCR worker bekleniyor";
  if (job.provider === "gemini_batch" && job.stage === "detecting") return "Batch tespit";
  if (job.provider === "migration" && isActiveJob(job)) return "Taşınıyor";
  return STAGE_LABELS[job.stage];
};
