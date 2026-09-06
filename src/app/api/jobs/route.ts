import { auth } from "@/auth";
import { listPageJobs, pumpPageJobs, toPageJobSummary } from "@/server/jobs/pageJobs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

/** Active and recently finished page jobs of a series. Polled by the editor. */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const seriesId = request.nextUrl.searchParams.get("seriesId");
  if (!seriesId || !z.string().uuid().safeParse(seriesId).success) {
    return NextResponse.json({ error: "seriesId is required" }, { status: 400 });
  }
  try {
    // Polling doubles as a nudge for the runner after a cold start.
    void pumpPageJobs();
    const jobs = await listPageJobs({ userId: session.user.id, seriesId });
    return NextResponse.json({ jobs: jobs.map(toPageJobSummary) });
  } catch (error) {
    console.error("Job listing failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Job listing failed" },
      { status: 500 },
    );
  }
}
