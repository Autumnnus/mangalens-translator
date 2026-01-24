import { auth } from "@/auth";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { getObjectBuffer, listObjects } from "@/lib/storage";
import JSZip from "jszip";
import { NextResponse } from "next/server";

export const maxDuration = 300;

export async function GET() {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const zip = new JSZip();

    const data = {
      users: await db.select().from(schema.users),
      accounts: await db.select().from(schema.accounts),
      categories: await db.select().from(schema.categories),
      series: await db.select().from(schema.series),
      images: await db.select().from(schema.images),
    };
    zip.file("db_dump.json", JSON.stringify(data, null, 2));

    const files = await listObjects();
    const folder = zip.folder("files");

    const chunkSize = 5;
    for (let i = 0; i < files.length; i += chunkSize) {
      const chunk = files.slice(i, i + chunkSize);
      await Promise.all(
        chunk.map(async (file) => {
          if (file.Key) {
            try {
              const buffer = await getObjectBuffer(file.Key);
              if (buffer) {
                folder?.file(file.Key, buffer);
              }
            } catch (e) {
              console.error(`Failed to export file ${file.Key}:`, e);
            }
          }
        }),
      );
    }

    const content = await zip.generateAsync({ type: "blob" });

    return new NextResponse(content, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename=mangalens_backup_${
          new Date().toISOString().split("T")[0]
        }.zip`,
      },
    });
  } catch (error) {
    console.error("Export failed:", error);
    const message = error instanceof Error ? error.message : "Export failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
