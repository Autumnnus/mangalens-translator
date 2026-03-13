import { auth } from "@/auth";
import { db } from "@/db";
import { images, series } from "@/db/schema";
import { getObjectBuffer } from "@/lib/storage";
import { and, eq, or } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export const maxDuration = 60;

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

    const width = clamp(
      Number.parseInt(req.nextUrl.searchParams.get("w") || "240", 10) || 240,
      64,
      512,
    );
    const quality = clamp(
      Number.parseInt(req.nextUrl.searchParams.get("q") || "70", 10) || 70,
      45,
      90,
    );

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

    const source = await getObjectBuffer(key);
    if (!source) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const thumbnail = await sharp(source)
      .rotate()
      .resize({ width, fit: "inside", withoutEnlargement: true })
      .webp({ quality })
      .toBuffer();
    const body = new Blob([Uint8Array.from(thumbnail).buffer], {
      type: "image/webp",
    });

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control":
          "private, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch (error) {
    console.error("Thumbnail route error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
