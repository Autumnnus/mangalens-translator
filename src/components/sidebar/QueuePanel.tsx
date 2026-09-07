"use client";

import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import React, { useMemo, useState } from "react";
import { jobKeys, usePageJobs } from "../../hooks/usePageJobs";
import { seriesKeys, useSeriesImagesQuery } from "../../hooks/useSeriesQueries";
import { cancelPageJob } from "../../services/translation.service";
import { useSeriesStore } from "../../stores/useSeriesStore";
import { useUIStore } from "../../stores/useUIStore";
import { describePageStatus } from "../../utils/stages";
import { IconButton, Mono, SectionLabel, Spinner, StageBar } from "../ui";

const MAX_ROWS = 5;

interface QueuePanelProps {
  collapsed?: boolean;
}

/**
 * Running and queued jobs of the active series, pinned under the series list.
 * Renders nothing when the queue is empty.
 */
const QueuePanel: React.FC<QueuePanelProps> = ({ collapsed = false }) => {
  const activeSeriesId = useSeriesStore((state) => state.activeSeriesId);
  const showToast = useUIStore((state) => state.showToast);
  const queryClient = useQueryClient();
  const { activeJobs } = usePageJobs(activeSeriesId);
  const { data: images } = useSeriesImagesQuery(activeSeriesId);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const rows = useMemo(() => {
    const byId = new Map((images || []).map((image) => [image.id, image]));
    return activeJobs
      .map((job) => {
        const image = byId.get(job.imageId);
        if (!image) return null;
        return { job, image, view: describePageStatus(image, job) };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((a, b) => a.image.sequenceNumber - b.image.sequenceNumber);
  }, [activeJobs, images]);

  if (rows.length === 0) return null;

  const cancel = async (jobId: string, fileName: string) => {
    setCancelling(jobId);
    try {
      await cancelPageJob(jobId);
      showToast(`${fileName}: cancelled.`, "info", 3000);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Could not cancel the job.",
        "error",
        5000,
      );
    } finally {
      setCancelling(null);
      if (activeSeriesId) {
        queryClient.invalidateQueries({ queryKey: jobKeys.series(activeSeriesId) });
        queryClient.invalidateQueries({ queryKey: seriesKeys.images(activeSeriesId) });
      }
    }
  };

  if (collapsed) {
    return (
      <div
        className="flex items-center justify-center border-t border-line py-2 text-action"
        title={`${rows.length} job${rows.length === 1 ? "" : "s"} running`}
      >
        <Spinner size="xs" label={`${rows.length} jobs running`} />
      </div>
    );
  }

  return (
    <section
      aria-label="Queue"
      aria-live="polite"
      className="shrink-0 border-t border-line bg-page px-2 pb-2 pt-2"
    >
      <div className="flex items-center justify-between px-1 pb-1.5">
        <SectionLabel>Queue</SectionLabel>
        <Mono className="text-xs text-ink-3">
          {rows.length} running
        </Mono>
      </div>
      <ul className="flex flex-col gap-1">
        {rows.slice(0, MAX_ROWS).map(({ job, image, view }) => (
          <li
            key={job.id}
            className="flex items-center gap-2 rounded-control px-1.5 py-1 hover:bg-page-2"
          >
            <Mono className="w-7 shrink-0 text-xs text-ink-3">
              p.{String(image.sequenceNumber).padStart(3, "0")}
            </Mono>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="truncate text-xs text-ink-2" title={image.fileName}>
                {view.label}
              </span>
              <StageBar stages={view.stages} size="sm" label={view.label} />
            </span>
            <IconButton
              label={`Cancel ${image.fileName}`}
              size="sm"
              variant="danger"
              loading={cancelling === job.id}
              onClick={() => void cancel(job.id, image.fileName)}
            >
              <X />
            </IconButton>
          </li>
        ))}
      </ul>
      {rows.length > MAX_ROWS && (
        <p className="px-1.5 pt-1 text-xs text-ink-3">
          and {rows.length - MAX_ROWS} more
        </p>
      )}
    </section>
  );
};

export default React.memo(QueuePanel);
