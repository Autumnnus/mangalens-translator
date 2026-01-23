/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "@/db";
import * as schema from "@/db/schema";
import { getObjectBuffer, listObjects } from "@/lib/storage";
import JSZip from "jszip";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const zip = new JSZip();

    // 1. Export DB
    const data = {
      users: await db.select().from(schema.users),
      accounts: await db.select().from(schema.accounts),
      categories: await db.select().from(schema.categories),
      series: await db.select().from(schema.series),
      images: await db.select().from(schema.images),
    };
    zip.file("db_dump.json", JSON.stringify(data, null, 2));

    // 2. Export Files
    const files = await listObjects();
    const folder = zip.folder("files");

    // Limit concurrency to avoid memory/network spikes
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
        "Content-Disposition": `attachment; filename=mangalens_backup_${new Date().toISOString()}.zip`,
      },
    });
  } catch (error: any) {
    console.error("Export failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
