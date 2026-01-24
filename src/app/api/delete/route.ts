import { auth } from "@/auth";
import { deleteObject } from "@/lib/storage";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { keys } = await req.json();

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
