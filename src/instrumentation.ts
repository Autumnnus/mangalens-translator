/**
 * Starts the in-process job scheduler when the Node.js server boots, so
 * queued page jobs resume after a restart and batch jobs are polled without
 * an open browser tab.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!process.env.DATABASE_URL) return;
  const { pumpPageJobs, startPageJobScheduler } = await import("@/server/jobs/pageJobs");
  const { pollBatchJobs } = await import("@/server/jobs/batchJobs");
  startPageJobScheduler(async () => {
    await pumpPageJobs();
    await pollBatchJobs();
  });
}
