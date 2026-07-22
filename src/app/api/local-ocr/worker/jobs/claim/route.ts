import { db } from "@/db";
import { localOcrJobs } from "@/db/schema";
import { authenticateLocalOcrWorker } from "@/server/local-ocr/auth";
import { and, asc, eq, inArray, lt, or } from "drizzle-orm";
import { NextResponse } from "next/server";

const LEASE_MS = 30 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const workerId = authenticateLocalOcrWorker(request);
    if (!workerId) {
      return NextResponse.json({ error: "Unauthorized worker" }, { status: 401 });
    }

    const now = new Date();
    const claimable = or(
      eq(localOcrJobs.status, "queued"),
      and(
        inArray(localOcrJobs.status, ["leased", "translating"]),
        lt(localOcrJobs.leaseExpiresAt, now),
      ),
    );
    const candidate = await db.query.localOcrJobs.findFirst({
      where: claimable,
      orderBy: asc(localOcrJobs.createdAt),
    });
    if (!candidate) return new Response(null, { status: 204 });

    const [claimed] = await db
      .update(localOcrJobs)
      .set({
        status: "leased",
        leaseOwner: workerId,
        leaseExpiresAt: new Date(Date.now() + LEASE_MS),
        attempts: candidate.attempts + 1,
        error: null,
        updatedAt: now,
      })
      .where(and(eq(localOcrJobs.id, candidate.id), claimable))
      .returning();
    if (!claimed) return new Response(null, { status: 204 });

    return NextResponse.json({
      job: {
        id: claimed.id,
        imageId: claimed.imageId,
        imageUrl: `/api/local-ocr/worker/jobs/${claimed.id}/image`,
        targetLanguage: claimed.targetLanguage,
        attempts: claimed.attempts,
      },
    });
  } catch (error) {
    console.error("Local OCR claim failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Worker claim failed" },
      { status: 500 },
    );
  }
}
