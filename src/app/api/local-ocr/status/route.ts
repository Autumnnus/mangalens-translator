import { auth } from "@/auth";
import { db } from "@/db";
import { localOcrJobs, localOcrWorkers } from "@/db/schema";
import { isLocalOcrConfigured } from "@/server/local-ocr/auth";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

const ONLINE_WINDOW_MS = 35_000;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [latestWorker, queued, active] = await Promise.all([
    db.query.localOcrWorkers.findFirst({
      orderBy: desc(localOcrWorkers.lastSeenAt),
    }),
    db
      .select({ value: count() })
      .from(localOcrJobs)
      .where(
        and(
          eq(localOcrJobs.userId, session.user.id),
          eq(localOcrJobs.status, "queued"),
        ),
      ),
    db
      .select({ value: count() })
      .from(localOcrJobs)
      .where(
        and(
          eq(localOcrJobs.userId, session.user.id),
          inArray(localOcrJobs.status, ["leased", "translating"]),
        ),
      ),
  ]);
  const lastSeenAt = latestWorker?.lastSeenAt || null;

  return NextResponse.json({
    configured: isLocalOcrConfigured(),
    online:
      !!lastSeenAt && Date.now() - lastSeenAt.getTime() <= ONLINE_WINDOW_MS,
    workerId: latestWorker?.workerId || null,
    lastSeenAt: lastSeenAt?.toISOString() || null,
    queuedJobs: queued[0]?.value || 0,
    activeJobs: active[0]?.value || 0,
  });
}
