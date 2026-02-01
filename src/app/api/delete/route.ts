import { auth } from "@/auth";
import { deleteByPrefix, deleteObject } from "@/lib/storage";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { keys, seriesId } = body;

    // If seriesId is provided, delete by prefix
    if (seriesId && typeof seriesId === "string") {
      const prefix = `${seriesId}/`;
      const result = await deleteByPrefix(prefix);
      return NextResponse.json({
        message: "Deletion processed by prefix",
        deleted: result.deleted,
      });
    }

    // Otherwise, use the old key-based deletion
    if (!keys || !Array.isArray(keys)) {
      return NextResponse.json({ error: "Invalid keys" }, { status: 400 });
    }

    const results = await Promise.allSettled(
      keys
        .filter((k) => k && typeof k === "string")
        .map((key) => deleteObject(key)),
    );

    return NextResponse.json({
      message: "Deletion processed",
      results: results.map((r) => r.status),
    });
  } catch (error: unknown) {
    console.error("Delete error:", error);
    const message =
      error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
