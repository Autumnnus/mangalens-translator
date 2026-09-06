/**
 * Renders a page from a layout document without touching the database.
 *
 *   npx tsx scripts/render-preview.ts --image page.jpg --layout layout.json --out out.jpg
 *   npx tsx scripts/render-preview.ts --image page.jpg --legacy bubbles.json --out out.jpg --debug
 *
 * --legacy takes the v1 `images.bubbles` array and converts it first.
 * --debug writes an extra *_debug image with text boxes (red) and masks (green).
 * --svg writes the text overlay SVG next to the output.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { layoutFromLegacyBubbles } from "../src/layout/legacy";
import { maskToSvgPath } from "../src/layout/svg";
import { PageLayout, pageLayoutSchema } from "../src/layout/types";
import { loadServerFonts } from "../src/server/render/fonts";
import { renderPage } from "../src/server/render/renderPage";
import { TextBubble } from "../src/types";

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

const required = (name: string) => {
  const value = args.get(name);
  if (typeof value !== "string") {
    console.error(`Missing --${name}`);
    process.exit(1);
  }
  return value;
};

const debugSvg = (layout: PageLayout) => {
  const shapes = layout.regions
    .map((region) => {
      const t = region.textBox;
      const mask = maskToSvgPath(region.mask);
      const area = region.render?.area;
      return [
        `<rect x="${t.x}" y="${t.y}" width="${t.w}" height="${t.h}" fill="none" stroke="#ff3b30" stroke-width="2" stroke-dasharray="6 4"/>`,
        mask
          ? `<path d="${mask}" fill="none" stroke="#34c759" stroke-width="2"/>`
          : "",
        area
          ? `<rect x="${area.x}" y="${area.y}" width="${area.w}" height="${area.h}" fill="none" stroke="#007aff" stroke-width="1.5"/>`
          : "",
        `<text x="${t.x + 2}" y="${Math.max(12, t.y - 4)}" font-size="14" font-family="sans-serif" fill="#ff3b30">${region.id} ${region.kind} ${region.render ? Math.round(region.render.fontSize) + "px" : ""}${region.render?.maskConfidence !== undefined ? " m=" + region.render.maskConfidence.toFixed(2) : ""}</text>`,
      ].join("");
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}">${shapes}</svg>`;
};

const main = async () => {
  const imagePath = required("image");
  const outPath = required("out");
  const original = await readFile(imagePath);
  const metadata = await sharp(original).rotate().metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;

  let layout: PageLayout;
  if (typeof args.get("legacy") === "string") {
    const bubbles = JSON.parse(
      await readFile(String(args.get("legacy")), "utf8"),
    ) as TextBubble[];
    layout = layoutFromLegacyBubbles(bubbles, width, height);
  } else {
    const parsed = pageLayoutSchema.safeParse(
      JSON.parse(await readFile(required("layout"), "utf8")),
    );
    if (!parsed.success) {
      console.error(parsed.error.issues.slice(0, 10));
      process.exit(1);
    }
    layout = parsed.data;
  }

  const fonts = await loadServerFonts();
  const started = Date.now();
  const result = await renderPage({ original, layout, fonts, format: "auto" });
  const elapsed = Date.now() - started;
  await writeFile(outPath, result.image);
  const base = outPath.replace(/\.[a-z0-9]+$/i, "");
  await writeFile(`${base}.layout.json`, JSON.stringify(result.layout, null, 2));
  if (args.get("svg")) await writeFile(`${base}.svg`, result.svg);
  if (args.get("debug")) {
    const debug = await sharp(result.image)
      .composite([{ input: Buffer.from(debugSvg(result.layout)), top: 0, left: 0 }])
      .jpeg({ quality: 88 })
      .toBuffer();
    await writeFile(`${base}_debug.jpg`, debug);
  }
  console.log(
    `Rendered ${path.basename(outPath)} (${result.width}x${result.height}) in ${elapsed}ms`,
  );
  for (const region of result.layout.regions) {
    const info = region.render;
    console.log(
      ` - ${region.id} ${region.kind} mask=${region.mask.type} ` +
        (info
          ? `font=${info.fontSize.toFixed(1)} lines=${info.lines.length} overflow=${info.overflow} conf=${info.maskConfidence?.toFixed(2) ?? "-"}`
          : "(not rendered)"),
    );
    for (const line of info?.maskDiagnostics || []) console.log(`     ! ${line}`);
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
