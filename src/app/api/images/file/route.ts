import { auth } from "@/auth";
import { db } from "@/db";
import { images, series } from "@/db/schema";
import { getObjectData } from "@/lib/storage";
import { and, eq, or } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

/** Serve an owned page through the app origin instead of exposing storage URLs. */
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const key = req.nextUrl.searchParams.get("key")?.trim();
    if (!key) {
      return NextResponse.json({ error: "Missing key" }, { status: 400 });
    }

    const allowed = await db
      .select({ id: images.id })
      .from(images)
      .innerJoin(series, eq(images.seriesId, series.id))
      .where(
        and(
          eq(series.userId, userId),
          or(eq(images.originalKey, key), eq(images.translatedKey, key)),
        ),
      )
      .limit(1);

    if (allowed.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const object = await getObjectData(key);
    if (!object.bytes) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return new NextResponse(Uint8Array.from(object.bytes), {
      status: 200,
      headers: {
        "Content-Type": object.contentType || "application/octet-stream",
        "Cache-Control": "private, max-age=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    console.error("Image file route error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
