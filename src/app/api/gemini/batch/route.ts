import { auth } from "@/auth";
import { db } from "@/db";
import { series, translationJobs } from "@/db/schema";
import { checkBatchJob, createBatchJobs, toBatchSummary } from "@/server/jobs/batchJobs";
import { and, desc, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const maxDuration = 300;

const createSchema = z.object({
  seriesId: z.string().uuid(),
  imageIds: z.array(z.string().uuid()).min(1).max(20),
});

/** Submits pages to Gemini Batch; each page gets a page job to follow. */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid batch payload" }, { status: 400 });
    }
    const ownerSeries = await db.query.series.findFirst({
      where: and(eq(series.id, parsed.data.seriesId), eq(series.userId, session.user.id)),
    });
    if (!ownerSeries) {
      return NextResponse.json({ error: "Series not found" }, { status: 404 });
    }
    const result = await createBatchJobs({
      userId: session.user.id,
      seriesId: parsed.data.seriesId,
      imageIds: parsed.data.imageIds,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Gemini batch create error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Batch creation failed" },
      { status: 500 },
    );
  }
}

/** Lists batch jobs of a series, or checks one job (the scheduler does this too). */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const jobId = request.nextUrl.searchParams.get("jobId");
    const seriesId = request.nextUrl.searchParams.get("seriesId");
    if (!jobId) {
      if (!seriesId) {
        return NextResponse.json({ error: "jobId is required" }, { status: 400 });
      }
      const jobs = await db.query.translationJobs.findMany({
        where: and(
          eq(translationJobs.userId, session.user.id),
          eq(translationJobs.seriesId, seriesId),
          inArray(translationJobs.status, ["queued", "running", "finalizing", "completed"]),
        ),
        orderBy: desc(translationJobs.createdAt),
        limit: 50,
      });
      return NextResponse.json({ jobs: jobs.map(toBatchSummary) });
    }
    const storedJob = await db.query.translationJobs.findFirst({
      where: and(eq(translationJobs.id, jobId), eq(translationJobs.userId, session.user.id)),
    });
    if (!storedJob) {
      return NextResponse.json({ error: "Batch job not found" }, { status: 404 });
    }
    const updated = await checkBatchJob(storedJob);
    return NextResponse.json({ job: toBatchSummary(updated) });
  } catch (error) {
    console.error("Gemini batch status error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Batch status failed" },
      { status: 500 },
    );
  }
}
