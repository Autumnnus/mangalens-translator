import { describeError } from "@/server/errors";
import { db } from "@/db";
import { localOcrJobs } from "@/db/schema";
import { getObjectData } from "@/lib/storage";
import { authenticateLocalOcrWorker } from "@/server/local-ocr/auth";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  try {
    const workerId = authenticateLocalOcrWorker(request);
    if (!workerId) {
      return NextResponse.json({ error: "Unauthorized worker" }, { status: 401 });
    }
    const { jobId } = await context.params;
    const job = await db.query.localOcrJobs.findFirst({
      where: and(
        eq(localOcrJobs.id, jobId),
        eq(localOcrJobs.leaseOwner, workerId),
        eq(localOcrJobs.status, "leased"),
      ),
      with: { image: true },
    });
    if (!job?.image) {
      return NextResponse.json({ error: "Leased OCR job not found" }, { status: 404 });
    }

    const object = await getObjectData(job.image.originalKey);
    if (!object.bytes?.length) {
      return NextResponse.json({ error: "Image object is empty" }, { status: 404 });
    }
    return new Response(new Uint8Array(object.bytes), {
      headers: {
        "Content-Type": object.contentType || "image/jpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Local OCR image download failed", error);
    return NextResponse.json(
      { error: describeError(error, "Image download failed") },
      { status: 500 },
    );
  }
}
