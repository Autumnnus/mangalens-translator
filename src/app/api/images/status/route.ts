import { describeError } from "@/server/errors";
import { auth } from "@/auth";
import { db } from "@/db";
import { images } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  seriesId: z.string().uuid(),
  imageId: z.string().uuid().optional(),
  imageIds: z.array(z.string().uuid()).min(1).max(500).optional(),
  status: z.enum(["idle", "processing", "completed", "error"]),
}).refine((value) => Boolean(value.imageId) !== Boolean(value.imageIds), {
  message: "Provide an imageId or imageIds",
});

export async function PATCH(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
    }

    const { imageId, imageIds, seriesId, status } = parsed.data;
    const targetIds = imageIds || (imageId ? [imageId] : []);

    const matchingImages = await db.query.images.findMany({
      where: and(
        inArray(images.id, targetIds),
        eq(images.seriesId, seriesId),
      ),
      with: {
        series: true,
      },
    });

    if (
      matchingImages.length !== targetIds.length ||
      matchingImages.some((image) => image.series.userId !== userId)
    ) {
      return NextResponse.json({ error: "Images not found" }, { status: 404 });
    }

    await db
      .update(images)
      .set({ status, updatedAt: new Date() })
      .where(and(inArray(images.id, targetIds), eq(images.seriesId, seriesId)));

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("image status update route error:", error);
    return NextResponse.json(
      {
        error: describeError(error, "Unknown server error"),
      },
      { status: 500 },
    );
  }
}
