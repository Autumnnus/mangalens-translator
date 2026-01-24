import { db } from "@/db";
import * as schema from "@/db/schema";
import { uploadObject } from "@/lib/storage";
import { Column, getTableColumns, getTableName, sql, Table } from "drizzle-orm";
import { PgColumn, PgTable } from "drizzle-orm/pg-core";
import JSZip from "jszip";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

interface BackupData {
  users: (typeof schema.users.$inferSelect)[];
  accounts: (typeof schema.accounts.$inferSelect)[];
  categories: (typeof schema.categories.$inferSelect)[];
  series: (typeof schema.series.$inferSelect)[];
  images: (typeof schema.images.$inferSelect)[];
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";

    let arrayBuffer: ArrayBuffer;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File;
      if (!file) throw new Error("No file uploaded in FormData");
      arrayBuffer = await file.arrayBuffer();
    } else {
      // Direct binary upload
      arrayBuffer = await req.arrayBuffer();
    }

    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      throw new Error("Empty file received");
    }

    console.log(`Received buffer: ${arrayBuffer.byteLength} bytes`);

    // JSZip sometimes works better with Buffer or Uint8Array than raw ArrayBuffer
    const buffer = Buffer.from(arrayBuffer);

    // Check for ZIP magic number (PK\x03\x04)
    if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      console.error(
        "Magic number mismatch:",
        buffer.slice(0, 4).toString("hex"),
      );
      throw new Error("File is not a valid ZIP (magic number mismatch)");
    }

    const zip = await JSZip.loadAsync(buffer);

    // 1. Restore DB
    const dbFile = zip.file("db_dump.json");
    if (!dbFile) throw new Error("Invalid backup: missing db_dump.json");

    const fileContent = await dbFile.async("string");
    const data = JSON.parse(fileContent) as BackupData;

    await db.transaction(async (tx) => {
      const processRows = (table: Table, rows: unknown[]) => {
        if (!rows || !Array.isArray(rows)) return [];
        const columns = getTableColumns(table);
        const columnKeys = Object.keys(columns);

        return rows.map((row: unknown) => {
          const rowData = row as Record<string, unknown>;
          const newRow: Record<string, unknown> = {};
          for (const key of columnKeys) {
            const val = rowData[key];
            if (val === undefined) continue;

            // Handle date strings from JSON
            if (
              typeof val === "string" &&
              /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)
            ) {
              const d = new Date(val);
              newRow[key] = isNaN(d.getTime()) ? val : d;
            } else {
              newRow[key] = val;
            }
          }
          return newRow;
        });
      };

      const restoreTable = async (
        table: PgTable,
        rows: unknown[],
        conflictTarget?: PgColumn | PgColumn[],
      ) => {
        const tableName = getTableName(table);
        console.log(
          `Restoring table ${tableName} with ${rows?.length || 0} rows...`,
        );
        const processed = processRows(table, rows);
        if (processed.length === 0) return;

        const columns = getTableColumns(table);
        const columnKeys = Object.keys(columns);

        const batchSize = 50;
        for (let i = 0; i < processed.length; i += batchSize) {
          const batch = processed.slice(i, i + batchSize) as Record<
            string,
            unknown
          >[];

          if (conflictTarget) {
            const updateSet: Record<string, unknown> = {};

            columnKeys.forEach((key) => {
              const column = columns[key] as Column;
              // Don't update the columns that are part of the conflict target
              const isTarget = Array.isArray(conflictTarget)
                ? conflictTarget.some(
                    (t: PgColumn) => t === column || t.name === column.name,
                  )
                : conflictTarget === column ||
                  (conflictTarget as PgColumn)?.name === column.name;

              if (!isTarget) {
                // Postgres 'excluded' table should not be qualified with the source table name.
                // It must be excluded."column_name", not excluded."table"."column_name"
                updateSet[key] = sql.raw(`excluded."${column.name}"`);
              }
            });

            if (Object.keys(updateSet).length > 0) {
              await tx.insert(table).values(batch).onConflictDoUpdate({
                target: conflictTarget,
                set: updateSet,
              });
            } else {
              await tx.insert(table).values(batch).onConflictDoNothing();
            }
          } else {
            await tx.insert(table).values(batch).onConflictDoNothing();
          }
        }
      };

      // Restore in dependency order
      console.log("Restoring users...");
      await restoreTable(schema.users, data.users, [schema.users.id]);

      console.log("Restoring accounts...");
      await restoreTable(schema.accounts, data.accounts);

      console.log("Restoring categories...");
      await restoreTable(schema.categories, data.categories, [
        schema.categories.id,
      ]);

      console.log("Restoring series...");
      await restoreTable(schema.series, data.series, [schema.series.id]);

      console.log("Restoring images...");
      await restoreTable(schema.images, data.images, [schema.images.id]);
    });

    // 2. Restore Files
    const fileFolder = zip.folder("files");
    if (fileFolder) {
      console.log("Restoring files...");
      const allFiles: { path: string; entry: JSZip.JSZipObject }[] = [];
      fileFolder.forEach((path, entry) => {
        if (!entry.dir) allFiles.push({ path, entry });
      });

      console.log(`Found ${allFiles.length} files to restore.`);

      const batchSize = 10;
      for (let i = 0; i < allFiles.length; i += batchSize) {
        const batch = allFiles.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async ({ path, entry }) => {
            try {
              const content = await entry.async("uint8array"); // Using uint8array as it is more universal than nodebuffer
              await uploadObject(path, content);
            } catch (e) {
              console.error(`Failed to restore file ${path}:`, e);
            }
          }),
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Import error detail:", error);
    const message = error instanceof Error ? error.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
