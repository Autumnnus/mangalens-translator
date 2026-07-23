import { db } from "@/db";
import { localOcrWorkers } from "@/db/schema";
import { authenticateLocalOcrWorker } from "@/server/local-ocr/auth";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const workerId = authenticateLocalOcrWorker(request);
    if (!workerId) {
      return NextResponse.json({ error: "Unauthorized worker" }, { status: 401 });
    }

    const now = new Date();
    await db
      .insert(localOcrWorkers)
      .values({ workerId, lastSeenAt: now })
      .onConflictDoUpdate({
        target: localOcrWorkers.workerId,
        set: { lastSeenAt: now },
      });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Local OCR heartbeat failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Heartbeat failed" },
      { status: 500 },
    );
  }
}
