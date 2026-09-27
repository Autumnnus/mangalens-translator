/**
 * Starts the in-process job scheduler when the Node.js server boots, so
 * queued page jobs resume after a restart without an open browser tab.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!process.env.DATABASE_URL) return;
  const { ensureAiCallsTable } = await import("@/server/usage/ledger");
  void ensureAiCallsTable();
  const { pumpPageJobs, startPageJobScheduler, sweepStalePageJobs } = await import("@/server/jobs/pageJobs");
  startPageJobScheduler(async () => {
    await sweepStalePageJobs();
    await pumpPageJobs();
  });
}
