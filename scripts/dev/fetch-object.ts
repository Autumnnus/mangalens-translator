/** Downloads one storage object using the app's MinIO settings (.env.local). */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { writeFile } from "node:fs/promises";
const main = async () => {
  const { getObjectBuffer } = await import("../../src/lib/storage");
  const [key, out] = process.argv.slice(2);
  if (!key || !out) throw new Error("usage: fetch-object.ts <key> <out>");
  const bytes = await getObjectBuffer(key);
  if (!bytes) throw new Error("empty object");
  await writeFile(out, Buffer.from(bytes));
  console.log("saved", out, bytes.length);
};
main().catch((error) => { console.error(error); process.exit(1); });
