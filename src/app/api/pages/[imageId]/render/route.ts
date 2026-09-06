import { auth } from "@/auth";
import { pageLayoutSchema } from "@/layout/types";
import { getOwnedImage, renderImage } from "@/server/pages/layoutService";
import { NextResponse } from "next/server";
import { z } from "zod";

export const maxDuration = 120;

type Context = { params: Promise<{ imageId: string }> };

const bodySchema = z.object({
  /** Omit to render the stored layout (or the legacy conversion). */
  layout: pageLayoutSchema.optional(),
  /** true: replace the page's translation; false: throw-away preview. */
  apply: z.boolean().default(false),
});

/**
 * Renders a page from its layout document on the server. Never calls a model;
 * the only inputs are the original pixels and the layout.
 */
export async function POST(request: Request, context: Context) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { imageId } = await context.params;
    if (!z.string().uuid().safeParse(imageId).success) {
      return NextResponse.json({ error: "Invalid image id" }, { status: 400 });
    }
    const image = await getOwnedImage(imageId, session.user.id);
    if (!image) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid render request",
          issues: parsed.error.issues.slice(0, 20).map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 },
      );
    }
    const result = await renderImage(image, parsed.data.layout ?? null, {
      apply: parsed.data.apply,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Page render failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Render failed" },
      { status: 500 },
    );
  }
}
