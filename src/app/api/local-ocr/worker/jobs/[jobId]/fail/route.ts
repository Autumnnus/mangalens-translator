import { db } from "@/db";
import { localOcrJobs } from "@/db/schema";
import { failPageJob, findActivePageJobByRef } from "@/server/jobs/pageJobs";
import { authenticateLocalOcrWorker } from "@/server/local-ocr/auth";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

const failureSchema = z.object({
  error: z.string().min(1).max(500),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  const workerId = authenticateLocalOcrWorker(request);
  if (!workerId) {
    return NextResponse.json({ error: "Unauthorized worker" }, { status: 401 });
  }
  const parsed = failureSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid failure payload" }, { status: 400 });
  }
  const { jobId } = await context.params;
  const current = await db.query.localOcrJobs.findFirst({
    where: and(
      eq(localOcrJobs.id, jobId),
      eq(localOcrJobs.status, "leased"),
      eq(localOcrJobs.leaseOwner, workerId),
    ),
  });
  if (!current) {
    return NextResponse.json({ error: "OCR job lease is no longer active" }, { status: 409 });
  }
  const retry = current.attempts < 3;
  await db
    .update(localOcrJobs)
    .set({
      status: retry ? "queued" : "failed",
      error: parsed.data.error,
      leaseOwner: null,
      leaseExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(eq(localOcrJobs.id, current.id));
  if (!retry) {
    const pageJob = await findActivePageJobByRef(current.id);
    if (pageJob) await failPageJob(pageJob.id, `Local OCR failed: ${parsed.data.error}`);
  }
  return NextResponse.json({ retry });
}
