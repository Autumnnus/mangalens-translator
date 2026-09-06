/**
 * Bulk migration of v1 (flattened) pages to layout v2 without the UI.
 * Re-typesets each page from its stored bubbles; no model calls are made.
 * The old render is kept in `legacy_translated_key` until dropped.
 *
 *   npx tsx scripts/migrate-legacy.ts --series <seriesId|all> [--limit 50] [--concurrency 2] [--dry-run]
 *
 * Requires DATABASE_URL and MinIO settings from .env.local.
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const args = new Map<string, string | boolean>();
for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (!arg.startsWith("--")) continue;
  const next = process.argv[i + 1];
  if (!next || next.startsWith("--")) args.set(arg.slice(2), true);
  else {
    args.set(arg.slice(2), next);
    i += 1;
  }
}

const main = async () => {
  const [{ db }, schema, { and, eq, isNotNull, sql }, { migrateLegacyPage }] = await Promise.all([
    import("../src/db"),
    import("../src/db/schema"),
    import("drizzle-orm"),
    import("../src/server/migration/legacy"),
  ]);
  const seriesArg = String(args.get("series") || "");
  if (!seriesArg) {
    console.error("--series <id|all> is required");
    process.exit(1);
  }
  const limit = Number(args.get("limit") || 0) || undefined;
  const concurrency = Math.max(1, Number(args.get("concurrency") || 2));
  const dryRun = args.get("dry-run") === true;

  const rows = await db
    .select({ image: schema.images })
    .from(schema.images)
    .where(
      and(
        seriesArg === "all" ? undefined : eq(schema.images.seriesId, seriesArg),
        eq(schema.images.layoutVersion, 1),
        isNotNull(schema.images.translatedKey),
        sql`jsonb_typeof(${schema.images.bubbles}) = 'array' and jsonb_array_length(${schema.images.bubbles}) > 0`,
      ),
    )
    .orderBy(schema.images.seriesId, schema.images.sequenceNumber)
    .limit(limit ?? 100000);

  console.log(`${rows.length} legacy page(s) eligible${dryRun ? " (dry run)" : ""}`);
  if (dryRun) {
    for (const { image } of rows) console.log(` - ${image.seriesId} / ${image.fileName}`);
    process.exit(0);
  }

  let done = 0;
  let failed = 0;
  let index = 0;
  const worker = async () => {
    while (index < rows.length) {
      const { image } = rows[index++];
      const started = Date.now();
      try {
        const result = await migrateLegacyPage(image, { apply: true });
        done += 1;
        console.log(`✓ ${image.fileName}: ${result.layout.regions.length} regions in ${Date.now() - started}ms`);
      } catch (error) {
        failed += 1;
        console.error(`✗ ${image.fileName}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  console.log(`Migrated ${done}, failed ${failed}. Old renders are kept until dropped from the UI.`);
  process.exit(failed > 0 ? 1 : 0);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
