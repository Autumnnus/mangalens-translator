/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "@/db";
import * as schema from "@/db/schema";
import { uploadObject } from "@/lib/storage";
import JSZip from "jszip";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) throw new Error("No file uploaded");

    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    // 1. Restore DB
    const dbFile = zip.file("db_dump.json");
    if (!dbFile) throw new Error("Invalid backup: missing db_dump.json");

    const data = JSON.parse(await dbFile.async("string"));

    // We use a transaction to ensure integrity
    await db.transaction(async (tx) => {
      // Restore logic: Upsert or Insert ignoring conflicts.
      // We prioritize preserving existing data if ID matches, or maybe updating?
      // For backup restore, usually we want to "overwrite" or "fill missing".
      // Let's use onConflictDoNothing for now to be safe, or user might want onConflictDoUpdate.
      // Given user wants "restore", probably onConflictDoUpdate is better for mutable fields.
      // But for simplicity and safety against broken foreign keys:

      // Helpers
      const processRows = (rows: any[]) => {
        if (!rows) return [];
        return rows.map((row) => {
          const newRow = { ...row };
          for (const key in newRow) {
            // Convert strings that look like dates back to Date objects
            if (
              typeof newRow[key] === "string" &&
              /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(newRow[key])
            ) {
              const d = new Date(newRow[key]);
              if (!isNaN(d.getTime())) {
                newRow[key] = d;
              }
            }
          }
          return newRow;
        });
      };

      const restoreTable = async (table: any, rows: any[]) => {
        const processed = processRows(rows);
        if (processed.length === 0) return;
        await tx.insert(table).values(processed).onConflictDoNothing();
      };

      await restoreTable(schema.users, data.users);
      await restoreTable(schema.accounts, data.accounts);
      await restoreTable(schema.categories, data.categories);
      await restoreTable(schema.series, data.series);
      await restoreTable(schema.images, data.images);
    });

    // 2. Restore Files
    const fileFolder = zip.folder("files");
    if (fileFolder) {
      const tasks: (() => Promise<void>)[] = [];

      fileFolder.forEach((relativePath, fileEntry) => {
        if (!fileEntry.dir) {
          tasks.push(async () => {
            try {
              const content = await fileEntry.async("nodebuffer");
              await uploadObject(relativePath, content);
            } catch (e) {
              console.error(`Failed to restore file ${relativePath}:`, e);
            }
          });
        }
      });

      // Batch execute
      const batchSize = 5;
      for (let i = 0; i < tasks.length; i += batchSize) {
        await Promise.all(tasks.slice(i, i + batchSize).map((t) => t()));
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Import failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
