import { describeError } from "@/server/errors";
import { pageLayoutSchema } from "@/layout/types";
import { loadServerFonts } from "@/server/render/fonts";
import { renderPage } from "@/server/render/renderPage";
import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * Development-only renderer for the /dev/layout-editor harness: renders a
 * layout against an image fetched from a URL, without the database or auth.
 * Returns 404 in production builds.
 */
const bodySchema = z.object({
  imageUrl: z.string().url(),
  layout: pageLayoutSchema,
});

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  try {
    const response = await fetch(parsed.data.imageUrl);
    if (!response.ok) throw new Error(`Image fetch failed: ${response.status}`);
    const original = Buffer.from(await response.arrayBuffer());
    const fonts = await loadServerFonts();
    const rendered = await renderPage({ original, layout: parsed.data.layout, fonts, format: "jpeg" });
    return NextResponse.json({
      layout: rendered.layout,
      url: `data:${rendered.contentType};base64,${rendered.image.toString("base64")}`,
      width: rendered.width,
      height: rendered.height,
    });
  } catch (error) {
    return NextResponse.json(
      { error: describeError(error, "Render failed") },
      { status: 500 },
    );
  }
}
