import { describeError } from "@/server/errors";
import { auth } from "@/auth";
import { pageLayoutSchema } from "@/layout/types";
import {
  getOwnedImage,
  loadOrBuildLayout,
  saveLayout,
} from "@/server/pages/layoutService";
import { NextResponse } from "next/server";
import { z } from "zod";

type Context = { params: Promise<{ imageId: string }> };

const idSchema = z.string().uuid();

/** Returns the stored layout, or one built from the legacy bubbles. */
export async function GET(_request: Request, context: Context) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { imageId } = await context.params;
    if (!idSchema.safeParse(imageId).success) {
      return NextResponse.json({ error: "Invalid image id" }, { status: 400 });
    }
    const image = await getOwnedImage(imageId, session.user.id);
    if (!image) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }
    const { layout, origin } = await loadOrBuildLayout(image);
    return NextResponse.json({
      layout,
      origin,
      layoutVersion: image.layoutVersion,
      hasLegacyRender: !!image.legacyTranslatedKey,
    });
  } catch (error) {
    console.error("Layout read failed", error);
    return NextResponse.json(
      { error: describeError(error, "Layout read failed") },
      { status: 500 },
    );
  }
}

/** Stores an edited layout without rendering it. */
export async function PUT(request: Request, context: Context) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { imageId } = await context.params;
    if (!idSchema.safeParse(imageId).success) {
      return NextResponse.json({ error: "Invalid image id" }, { status: 400 });
    }
    const image = await getOwnedImage(imageId, session.user.id);
    if (!image) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }
    const body = (await request.json()) as { layout?: unknown };
    const parsed = pageLayoutSchema.safeParse(body.layout);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid layout",
          issues: parsed.error.issues.slice(0, 20).map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 },
      );
    }
    const layout = await saveLayout(image.id, parsed.data);
    return NextResponse.json({ layout });
  } catch (error) {
    console.error("Layout save failed", error);
    return NextResponse.json(
      { error: describeError(error, "Layout save failed") },
      { status: 500 },
    );
  }
}
