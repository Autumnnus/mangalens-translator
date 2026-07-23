import { auth } from "@/auth";
import { db } from "@/db";
import { localOcrJobs } from "@/db/schema";
import { toLocalOcrSummary } from "@/server/local-ocr/jobs";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const jobId = request.nextUrl.searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  }
  const job = await db.query.localOcrJobs.findFirst({
    where: and(
      eq(localOcrJobs.id, jobId),
      eq(localOcrJobs.userId, session.user.id),
    ),
  });
  if (!job) {
    return NextResponse.json({ error: "Local OCR job not found" }, { status: 404 });
  }
  return NextResponse.json({ job: toLocalOcrSummary(job) });
}
