/**
 * Runs the page pipeline on a local image without the database:
 * pixel detection -> model reading -> model translation -> server render.
 *
 *   npx tsx scripts/pipeline-preview.ts --image page.jpg --out out.png [--debug] [--cache page.json]
 *     [--provider gemini|openai] [--base-url https://…/v1] [--key-env ENV_NAME]
 *     [--model reader-model] [--translate-model text-model] [--lang Turkish] [--adult]
 *
 * Defaults: Gemini with GEMINI_API_KEY / NEXT_PUBLIC_GEMINI_API_KEY from
 * .env.local. --cache stores the reading as soon as it exists and the
 * translation after it, and reuses both, so render changes cost nothing.
 * --debug writes *_overlay.jpg (what the reader saw) and *_debug.jpg.
 */
import * as dotenv from "dotenv";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { DEFAULT_READER_MODEL } from "../src/lib/aiCatalog";
import { createLayout } from "../src/layout/defaults";
import { maskToSvgPath } from "../src/layout/svg";
import { PageLayout } from "../src/layout/types";
import { detectTextBlocks } from "../src/server/detect/textDetector";
import { combineUsage } from "../src/server/llm/usage";
import { buildNumberedOverlay, DetectedRegion, readBlocks } from "../src/server/pipeline/read";
import { regionsFromReading } from "../src/server/pipeline/translatePage";
import { translateItems } from "../src/server/pipeline/translate";
import { loadServerFonts } from "../src/server/render/fonts";
import { renderPage } from "../src/server/render/renderPage";
import { AiSettings, UsageBreakdown } from "../src/types";
import { calculateUsageCost } from "../src/utils/cost";

dotenv.config({ path: ".env.local", quiet: true });

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
const str = (name: string, fallback?: string) => {
  const value = args.get(name);
  if (typeof value === "string") return value;
  if (fallback !== undefined) return fallback;
  console.error(`Missing --${name}`);
  process.exit(1);
};

const debugSvg = (layout: PageLayout) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}">${layout.regions
    .map((region) => {
      const t = region.textBox;
      const mask = maskToSvgPath(region.mask);
      const area = region.render?.area;
      return [
        `<rect x="${t.x}" y="${t.y}" width="${t.w}" height="${t.h}" fill="none" stroke="#ff3b30" stroke-width="2" stroke-dasharray="6 4"/>`,
        mask ? `<path d="${mask}" fill="none" stroke="#34c759" stroke-width="2"/>` : "",
        area ? `<rect x="${area.x}" y="${area.y}" width="${area.w}" height="${area.h}" fill="none" stroke="#007aff" stroke-width="1.5"/>` : "",
        `<text x="${t.x + 2}" y="${Math.max(12, t.y - 4)}" font-size="14" font-family="sans-serif" fill="#ff3b30">${region.id} ${region.kind}${region.hidden ? " hidden" : ""}</text>`,
      ].join("");
    })
    .join("")}</svg>`;

type PreviewCache = {
  regions: DetectedRegion[];
  sourceLanguage?: string;
  scene?: string;
  translations?: Record<string, string>;
};

const main = async () => {
  const kind = str("provider", "gemini") === "openai" ? "openai" : "gemini";
  const key = (process.env[str("key-env", kind === "gemini" ? "GEMINI_API_KEY" : "OPENAI_API_KEY")] ||
    (kind === "gemini" ? process.env.NEXT_PUBLIC_GEMINI_API_KEY : "") ||
    "").trim();
  const reader = str("model", kind === "gemini" ? DEFAULT_READER_MODEL : "");
  if (!reader) throw new Error("Pass --model for OpenAI-compatible providers");
  const ai: AiSettings = {
    providers: [
      {
        id: "preview",
        name: kind === "gemini" ? "Gemini" : "OpenAI-compatible",
        preset: kind === "gemini" ? "gemini" : "custom",
        kind,
        baseUrl: kind === "openai" ? str("base-url", "https://api.openai.com/v1") : undefined,
        apiKeys: key ? [key] : [],
      },
    ],
    reader: { providerId: "preview", model: reader },
    translator: { providerId: "preview", model: str("translate-model", reader) },
  };
  const imagePath = str("image");
  const outPath = str("out");
  const base = outPath.replace(/\.[a-z0-9]+$/i, "");
  const targetLanguage = str("lang", "Turkish");
  const cachePath = typeof args.get("cache") === "string" ? (args.get("cache") as string) : undefined;
  const cached: PreviewCache | null =
    cachePath && existsSync(cachePath) ? JSON.parse(await readFile(cachePath, "utf8")) : null;

  const original = await readFile(imagePath);
  const meta = await sharp(original).rotate().metadata();
  const width = meta.autoOrient?.width || meta.width || 0;
  const height = meta.autoOrient?.height || meta.height || 0;
  const started = Date.now();
  const usage: UsageBreakdown[] = [];

  let reading: PreviewCache;
  if (cached) {
    reading = cached;
    console.log(`Using cached reading${cached.translations ? " and translation" : ""} from ${cachePath}`);
  } else {
    const detection = await detectTextBlocks(original);
    console.log(`Detector: ${detection.blocks.length} blocks in ${detection.durationMs} ms`);
    if (args.get("debug")) {
      const overlay = await buildNumberedOverlay(original, width, height, detection.blocks);
      await writeFile(`${base}_overlay.jpg`, Buffer.from(overlay.base64, "base64"));
    }
    const read = detection.blocks.length
      ? await readBlocks({ ai, original, width, height, blocks: detection.blocks, usage })
      : { regions: [], sourceLanguage: undefined, scene: undefined, model: reader };
    console.log(`Reading (${read.model}): ${read.regions.length} regions, language=${read.sourceLanguage ?? "?"}`);
    if (read.scene) console.log(`Scene: ${read.scene}`);
    for (const region of read.regions) {
      console.log(`  [${region.kind}${region.speaker ? ` · ${region.speaker}` : ""}] ${JSON.stringify(region.sourceText)}`);
    }
    reading = { regions: read.regions, sourceLanguage: read.sourceLanguage, scene: read.scene };
    if (cachePath) await writeFile(cachePath, JSON.stringify(reading, null, 2));
  }

  const regions = regionsFromReading(reading.regions, reading.sourceLanguage);
  if (!reading.translations) {
    const { translations } = await translateItems({
      ai,
      targetLanguage,
      context: { sourceLanguage: reading.sourceLanguage, scene: reading.scene, adult: !!args.get("adult") },
      items: regions.map((region) => ({ id: region.id, kind: region.kind, text: region.sourceText, speaker: region.speaker })),
      usage,
    });
    reading.translations = Object.fromEntries(translations);
    if (cachePath) await writeFile(cachePath, JSON.stringify(reading, null, 2));
  }
  for (const region of regions) region.translatedText = reading.translations[region.id] || "";

  for (const region of regions) console.log(`  ${region.id}: ${JSON.stringify(region.translatedText)}`);
  const layout = createLayout(width, height, regions, { source: "ai", targetLanguage, scene: reading.scene });
  const rendered = await renderPage({ original, layout, fonts: await loadServerFonts(), format: "auto" });
  await writeFile(outPath, rendered.image);
  await writeFile(`${base}.layout.json`, JSON.stringify(rendered.layout, null, 2));
  if (args.get("debug")) {
    const debug = await sharp(rendered.image)
      .composite([{ input: Buffer.from(debugSvg(rendered.layout)), top: 0, left: 0 }])
      .jpeg({ quality: 88 })
      .toBuffer();
    await writeFile(`${base}_debug.jpg`, debug);
  }
  const total = combineUsage(usage, ai.translator.model, false);
  console.log(
    `Done in ${Date.now() - started} ms · ${total.totalTokenCount} tokens · $${calculateUsageCost(total).toFixed(5)}`,
  );
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
