import { auth } from "@/auth";
import { getPresignedUploadUrl } from "@/lib/storage";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
      fileName,
      contentType,
      seriesId,
      key: existingKey,
    } = await req.json();

    if (!fileName || !contentType || !seriesId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const cleanFileName = fileName.replace(/\s+/g, "-");
    const key = existingKey || `${seriesId}/${Date.now()}_${cleanFileName}`;

    const { uploadUrl, publicUrl } = await getPresignedUploadUrl(
      key,
      contentType,
    );

    return NextResponse.json({ uploadUrl, key, publicUrl });
  } catch (error: unknown) {
    console.error("Upload error:", error);
    const message =
      error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
