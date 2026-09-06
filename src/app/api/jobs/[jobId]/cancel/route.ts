import { auth } from "@/auth";
import { cancelPageJob, toPageJobSummary } from "@/server/jobs/pageJobs";
import { NextResponse } from "next/server";
import { z } from "zod";

export async function POST(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { jobId } = await context.params;
  if (!z.string().uuid().safeParse(jobId).success) {
    return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
  }
  const job = await cancelPageJob(jobId, session.user.id);
  if (!job) {
    return NextResponse.json({ error: "No active job to cancel" }, { status: 404 });
  }
  return NextResponse.json({ job: toPageJobSummary(job) });
}
