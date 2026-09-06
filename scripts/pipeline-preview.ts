/**
 * Runs the full page pipeline on a local image without the database:
 * Gemini detection -> text translation -> server render. Uses
 * NEXT_PUBLIC_GEMINI_API_KEY from .env.local and bills two small calls.
 *
 *   npx tsx scripts/pipeline-preview.ts --image page.jpg --out out.jpg [--model gemini-2.5-flash] [--lang Turkish] [--debug]
 */
import * as dotenv from "dotenv";
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { createLayout, createRegion } from "../src/layout/defaults";
import { maskToSvgPath } from "../src/layout/svg";
import { PageLayout } from "../src/layout/types";
import { detectTextBlocks } from "../src/server/detect/textDetector";
import { DetectedRegion, detectRegions } from "../src/server/gemini/detect";
import { buildNumberedOverlay, readRegions } from "../src/server/gemini/readRegions";
import { refineRegions } from "../src/server/gemini/refine";
import { translateItems } from "../src/server/gemini/translateText";
import { prepareModelImage } from "../src/server/pipeline/prepareImage";
import { loadServerFonts } from "../src/server/render/fonts";
import { renderPage } from "../src/server/render/renderPage";
import { calculateGeminiCost } from "../src/utils/cost";
import { combineUsage } from "../src/server/gemini/common";

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
      const b = region.bubbleBox;
      const mask = maskToSvgPath(region.mask);
      return [
        `<rect x="${t.x}" y="${t.y}" width="${t.w}" height="${t.h}" fill="none" stroke="#ff3b30" stroke-width="2" stroke-dasharray="6 4"/>`,
        b ? `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="none" stroke="#ff9500" stroke-width="1.5" stroke-dasharray="2 3"/>` : "",
        mask ? `<path d="${mask}" fill="none" stroke="#34c759" stroke-width="2"/>` : "",
        `<text x="${t.x + 2}" y="${Math.max(12, t.y - 4)}" font-size="14" font-family="sans-serif" fill="#ff3b30">${region.id} ${region.kind} c=${(region.confidence ?? 0).toFixed(2)}</text>`,
      ].join("");
    })
    .join("")}</svg>`;

const main = async () => {
  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("NEXT_PUBLIC_GEMINI_API_KEY is not set");
  const imagePath = str("image");
  const outPath = str("out");
  const modelName = str("model", "gemini-2.5-flash-lite");
  const targetLanguage = str("lang", "Turkish");

  const original = await readFile(imagePath);
  const started = Date.now();
  const upscale = args.get("upscale") === undefined ? undefined : Number(args.get("upscale")) || 0;
  const modelImage = await prepareModelImage(original, undefined, upscale);
  console.log(
    `Model input: ${modelImage.modelWidth}x${modelImage.modelHeight} (${Math.round(modelImage.bytes / 1024)} KB) from ${modelImage.width}x${modelImage.height}`,
  );

  const stageUsage: import("../src/types").UsageBreakdown[] = [];
  let detectedRegions: DetectedRegion[] = [];
  let sourceLanguage: string | undefined;
  const detected = args.get("no-detector") ? { blocks: [], durationMs: 0 } : await detectTextBlocks(original);
  console.log(`Local detector: ${detected.blocks.length} blocks in ${detected.durationMs}ms`);
  if (detected.blocks.length > 0) {
    const overlay = await buildNumberedOverlay(original, modelImage.width, modelImage.height, detected.blocks);
    if (args.get("debug")) {
      await writeFile(outPath.replace(/\.[a-z0-9]+$/i, "") + "_overlay.jpg", Buffer.from(overlay.base64, "base64"));
    }
    const readStarted = Date.now();
    const read = await readRegions({ apiKey, modelName, overlay, blocks: detected.blocks });
    stageUsage.push(read.usage);
    detectedRegions = read.result.regions;
    sourceLanguage = read.result.sourceLanguage;
    console.log(
      `Reading (${modelName}): ${read.result.regions.length} regions from ${detected.blocks.length} boxes, language=${sourceLanguage ?? "?"}, tokens=${read.usage.totalTokenCount}, ${Date.now() - readStarted}ms`,
    );
    for (const region of read.result.regions) {
      console.log(
        `  [${region.kind}] ${JSON.stringify(region.sourceText)} box=${[region.textBox.x, region.textBox.y, region.textBox.w, region.textBox.h].map(Math.round).join(",")} c=${region.confidence.toFixed(2)}`,
      );
    }
  } else {
    const detection = await detectRegions({
      apiKey,
      modelName,
      base64Image: modelImage.base64,
      mimeType: modelImage.mimeType,
      width: modelImage.width,
      height: modelImage.height,
    });
    stageUsage.push(detection.usage);
    sourceLanguage = detection.parsed.sourceLanguage;
    console.log(
      `Detection (${modelName}): ${detection.parsed.regions.length} regions, tokens=${detection.usage.totalTokenCount}, ${Date.now() - started}ms`,
    );
    const refinement = args.get("no-refine")
      ? null
      : await refineRegions({
          apiKey,
          modelName,
          original,
          width: modelImage.width,
          height: modelImage.height,
          regions: detection.parsed.regions,
        });
    if (refinement) stageUsage.push(refinement.usage);
    detectedRegions = refinement ? refinement.regions : detection.parsed.regions;
    for (const region of detectedRegions) {
      console.log(
        `  [${region.kind}] ${JSON.stringify(region.sourceText)} box=${[region.textBox.x, region.textBox.y, region.textBox.w, region.textBox.h].map(Math.round).join(",")} c=${region.confidence.toFixed(2)}`,
      );
    }
  }

  const regions = detectedRegions.map((item, index) =>
    createRegion({
      id: `g_${index + 1}`,
      kind: item.kind,
      order: item.order,
      textBox: item.textBox,
      bubbleBox: item.bubbleBox,
      sourceText: item.sourceText,
      translatedText: "",
      source: "gemini",
      confidence: item.confidence,
      textBoxPrecise: item.precise,
      sourceLineHeight: item.lineHeight,
    }),
  );

  const translateStarted = Date.now();
  const translation = await translateItems({
    apiKey,
    modelName,
    targetLanguage,
    context: { sourceLanguage },
    items: regions.map((region) => ({
      id: region.id,
      kind: region.kind,
      text: region.sourceText,
    })),
  });
  console.log(
    `Translation (${modelName}): tokens=${translation.usage.totalTokenCount}, ${Date.now() - translateStarted}ms`,
  );
  for (const region of regions) {
    region.translatedText = translation.translations.get(region.id) || "";
    console.log(`  ${region.id}: ${JSON.stringify(region.translatedText)}`);
  }

  const layout = createLayout(modelImage.width, modelImage.height, regions, {
    source: "gemini",
    detector: `gemini:${modelName}`,
    targetLanguage,
  });
  const fonts = await loadServerFonts();
  const renderStarted = Date.now();
  const rendered = await renderPage({ original, layout, fonts, format: "auto" });
  console.log(`Render: ${Date.now() - renderStarted}ms`);

  await writeFile(outPath, rendered.image);
  const base = outPath.replace(/\.[a-z0-9]+$/i, "");
  await writeFile(`${base}.layout.json`, JSON.stringify(rendered.layout, null, 2));
  if (args.get("debug")) {
    const debug = await sharp(rendered.image)
      .composite([{ input: Buffer.from(debugSvg(rendered.layout)), top: 0, left: 0 }])
      .jpeg({ quality: 88 })
      .toBuffer();
    await writeFile(`${base}_debug.jpg`, debug);
  }

  const usage = combineUsage([...stageUsage, translation.usage], modelName, false);
  console.log(
    `Total: ${usage.totalTokenCount} tokens (prompt ${usage.promptTokenCount}, output ${usage.candidatesTokenCount}), estimated cost $${calculateGeminiCost(usage, modelName).toFixed(5)}, ${Date.now() - started}ms`,
  );
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
