import { auth } from "@/auth";
import { db } from "@/db";
import { images } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  imageId: z.string().uuid(),
  seriesId: z.string().uuid(),
  status: z.enum(["idle", "processing", "completed", "error"]),
});

export async function PATCH(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
    }

    const { imageId, seriesId, status } = parsed.data;

    const image = await db.query.images.findFirst({
      where: and(eq(images.id, imageId), eq(images.seriesId, seriesId)),
      with: {
        series: true,
      },
    });

    if (!image || image.series.userId !== session.user.id) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }

    await db
      .update(images)
      .set({ status, updatedAt: new Date() })
      .where(eq(images.id, imageId));

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("image status update route error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown server error",
      },
      { status: 500 },
    );
  }
}
