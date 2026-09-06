import { auth } from "@/auth";
import {
  dropLegacyRender,
  migrateLegacyPage,
  revertLegacyPage,
} from "@/server/migration/legacy";
import { getOwnedImage } from "@/server/pages/layoutService";
import { NextResponse } from "next/server";
import { z } from "zod";

export const maxDuration = 120;

const bodySchema = z.object({
  action: z.enum(["preview", "apply", "revert", "drop-legacy"]),
});

/**
 * Per-page migration actions. preview/apply re-typeset a v1 page from its
 * stored bubbles (no model call); revert puts the v1 render back; drop-legacy
 * deletes the kept v1 render after review.
 */
export async function POST(request: Request, context: { params: Promise<{ imageId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { imageId } = await context.params;
  if (!z.string().uuid().safeParse(imageId).success) {
    return NextResponse.json({ error: "Invalid image id" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
  }
  const image = await getOwnedImage(imageId, session.user.id);
  if (!image) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }
  try {
    switch (parsed.data.action) {
      case "preview":
      case "apply": {
        const result = await migrateLegacyPage(image, { apply: parsed.data.action === "apply" });
        return NextResponse.json({ url: result.url, applied: result.applied, regions: result.layout.regions.length });
      }
      case "revert":
        await revertLegacyPage(image);
        return NextResponse.json({ reverted: true });
      case "drop-legacy":
        return NextResponse.json({ dropped: await dropLegacyRender(image) });
    }
  } catch (error) {
    console.error("Page migration action failed", image.id, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Migration failed" },
      { status: 500 },
    );
  }
}
