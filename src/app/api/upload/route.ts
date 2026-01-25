import { auth } from "@/auth";
import { getPresignedUploadUrl } from "@/lib/storage";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    // Support batch requests
    if (body.items && Array.isArray(body.items)) {
      interface BatchItem {
        fileName: string;
        contentType: string;
        seriesId: string;
        key?: string;
      }

      const results = await Promise.all(
        body.items.map(async (item: BatchItem) => {
          const { fileName, contentType, seriesId, key: existingKey } = item;
          if (!fileName || !contentType || !seriesId) {
            throw new Error("Missing required fields in one of the items");
          }
          const cleanFileName = fileName.replace(/\s+/g, "-");
          const key =
            existingKey ||
            `${seriesId}/${Date.now()}_${Math.random().toString(36).substring(7)}_${cleanFileName}`;
          const { uploadUrl, publicUrl } = await getPresignedUploadUrl(
            key,
            contentType,
          );
          return { uploadUrl, key, publicUrl };
        }),
      );
      return NextResponse.json({ items: results });
    }

    // fallback to single record for compatibility
    const { fileName, contentType, seriesId, key: existingKey } = body;

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
