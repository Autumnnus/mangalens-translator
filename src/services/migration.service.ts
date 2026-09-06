import { MigrationStats } from "@/server/migration/legacy";

/** Client calls for the legacy-to-layout migration tools. */

const parse = async <T>(response: Response, fallback: string): Promise<T> => {
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || fallback);
  return data;
};

export type { MigrationStats };

export const fetchMigrationStats = (seriesId: string) =>
  fetch(`/api/series/${encodeURIComponent(seriesId)}/migration`, {
    cache: "no-store",
    credentials: "same-origin",
  }).then((response) => parse<MigrationStats>(response, "Migration stats could not be read"));

export const startMigration = (
  seriesId: string,
  strategy: "legacy" | "redetect",
  imageIds?: string[],
) =>
  fetch(`/api/series/${encodeURIComponent(seriesId)}/migration`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ strategy, imageIds }),
  }).then((response) => parse<{ queued: number; skipped: number }>(response, "Migration could not start"));

export const dropSeriesLegacy = (seriesId: string) =>
  fetch(`/api/series/${encodeURIComponent(seriesId)}/migration`, {
    method: "DELETE",
    credentials: "same-origin",
  }).then((response) => parse<{ deleted: number }>(response, "Cleanup failed"));

export const pageMigrationAction = (
  imageId: string,
  action: "preview" | "apply" | "revert" | "drop-legacy",
) =>
  fetch(`/api/pages/${encodeURIComponent(imageId)}/migrate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ action }),
  }).then((response) =>
    parse<{ url?: string; applied?: boolean; reverted?: boolean; dropped?: boolean }>(
      response,
      "Migration action failed",
    ),
  );
