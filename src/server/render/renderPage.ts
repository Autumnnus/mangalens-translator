import sharp from "sharp";
import { scaleLayout } from "@/layout/defaults";
import { polygonShape } from "@/layout/typeset";
import { FontSet } from "@/layout/fontEngine";
import { planRegion, RegionPlan, ResolvedRegionFacts } from "@/layout/plan";
import { buildOverlaySvg } from "@/layout/svg";
import {
  Box,
  isContainerKind,
  Mask,
  PageLayout,
  Point,
  Region,
} from "@/layout/types";
import {
  detectBubbleInterior,
  fillEllipse,
  fillPolygon,
  fillRoundedRect,
  RawImage,
  sampleBoxColor,
  sampleRingColor,
  snapTextBoxToInk,
} from "./mask";

/**
 * Deterministic page renderer: original pixels + layout document -> image.
 *
 * 1. Resolve every "auto" mask against the pixels (bubble interior search).
 * 2. Paint all masks with their fill colour directly in the raw buffer.
 * 3. Typeset every region and rasterise the text overlay from outline paths.
 */

export interface RenderPageOptions {
  original: Buffer;
  layout: PageLayout;
  fonts: FontSet;
  format?: "jpeg" | "png" | "auto";
  quality?: number;
}

export interface RenderPageResult {
  image: Buffer;
  contentType: "image/jpeg" | "image/png";
  /** Layout with resolved masks and per-region render info. */
  layout: PageLayout;
  svg: string;
  width: number;
  height: number;
}

const MAX_INPUT_PIXELS = 120_000_000;

const expandBox = (box: Box, rx: number, ry: number): Box => ({
  x: box.x - box.w * rx,
  y: box.y - box.h * ry,
  w: box.w * (1 + rx * 2),
  h: box.h * (1 + ry * 2),
});

const shouldClean = (region: Region) =>
  !region.hidden &&
  region.placement === "inside" &&
  region.fill.mode !== "none" &&
  region.mask.type !== "none";

/**
 * Geometric fallback when no closed interior is found around the text. It
 * stays close to the source glyphs on purpose: painting the detector's whole
 * balloon box would cover outlines and artwork.
 */
const fallbackMask = (region: Region): Mask => {
  if (region.kind === "speech" || region.kind === "thought") {
    return { type: "rect", box: expandBox(region.textBox, 0.07, 0.1), radius: 0.4 };
  }
  return { type: "rect", box: expandBox(region.textBox, 0.04, 0.06), radius: 0.08 };
};

export const resolveRegionMask = (
  raw: RawImage,
  region: Region,
): { region: Region; facts: ResolvedRegionFacts } => {
  if (!shouldClean(region)) {
    const surface = sampleBoxColor(raw, region.textBox);
    return { region, facts: { surfaceLuma: surface.luma } };
  }

  if (region.mask.type === "auto") {
    const diagnostics: string[] = [];
    // Detector boxes drift on real scans: align the box with the glyphs first.
    // Boxes the user placed by hand (manual source, or already snapped once)
    // are left alone.
    let working = region;
    if (
      region.source !== "manual" &&
      !region.detectorBox &&
      !region.textBoxPrecise &&
      !region.locked &&
      (isContainerKind(region.kind) || region.kind === "label")
    ) {
      const snapped = snapTextBoxToInk(raw, region.textBox, diagnostics);
      if (snapped) {
        working = { ...region, textBox: snapped.box, detectorBox: region.textBox };
        diagnostics.push(
          `text box snapped to ink (${Math.round(snapped.box.x - region.textBox.x)}, ${Math.round(snapped.box.y - region.textBox.y)} px, conf ${snapped.confidence.toFixed(2)})`,
        );
      }
    }
    const detected =
      isContainerKind(working.kind) || working.kind === "label"
        ? detectBubbleInterior(raw, working.textBox, {
            hint: working.bubbleBox,
            diagnostics,
          })
        : null;
    if (detected) {
      const fillColor =
        working.fill.mode === "color" && working.fill.color
          ? working.fill.color
          : detected.fillColor;
      return {
        region: { ...working, mask: { type: "polygon", points: detected.polygon } },
        facts: {
          fillColor,
          surfaceLuma: detected.luma,
          maskConfidence: detected.confidence,
          maskDiagnostics: diagnostics,
        },
      };
    }
    const ring = sampleRingColor(raw, working.textBox);
    // Only paint a geometric fallback on paper-like, uniform surroundings.
    // Anything else (artwork, tone) is left untouched and the text is drawn
    // with a contrasting stroke instead of a coloured block.
    const paperLike = ring.luma >= 200 && ring.brightFraction >= 0.65;
    if (!paperLike) {
      diagnostics.push(
        `no fallback paint: surroundings are not paper (luma ${ring.luma.toFixed(0)}, bright ${(ring.brightFraction * 100).toFixed(0)}%)`,
      );
      return {
        region: { ...working, mask: { type: "none" }, maskSource: "fallback" },
        facts: { surfaceLuma: ring.luma, maskConfidence: 0, maskDiagnostics: diagnostics },
      };
    }
    const fillColor =
      working.fill.mode === "color" && working.fill.color
        ? working.fill.color
        : ring.color;
    return {
      region: { ...working, mask: fallbackMask(working), maskSource: "fallback" },
      facts: {
        fillColor,
        surfaceLuma: ring.luma,
        maskConfidence: 0.25,
        maskDiagnostics: diagnostics,
      },
    };
  }

  const ring = sampleRingColor(raw, region.textBox);
  const fillColor =
    region.fill.mode === "color" && region.fill.color
      ? region.fill.color
      : ring.color;
  return {
    region,
    facts: { fillColor, surfaceLuma: ring.luma },
  };
};

/** True when the polygon's rows span the whole box (no glyph fragments left outside). */
const polygonCoversBox = (points: Point[], box: Box) => {
  const shape = polygonShape(points);
  const samples = 6;
  for (let i = 0; i <= samples; i += 1) {
    const y = box.y + (box.h * i) / samples;
    const chord = shape.chordAt(y);
    if (!chord || chord.left > box.x + box.w * 0.05 || chord.right < box.x + box.w * 0.95) {
      return false;
    }
  }
  return true;
};

const applyFill = (raw: RawImage, mask: Mask, color: string) => {
  switch (mask.type) {
    case "polygon":
      fillPolygon(raw, mask.points, color);
      break;
    case "ellipse":
      fillEllipse(raw, mask.box, color);
      break;
    case "rect":
      fillRoundedRect(raw, mask.box, mask.radius ?? 0, color);
      break;
    default:
      break;
  }
};

export const renderPage = async (
  options: RenderPageOptions,
): Promise<RenderPageResult> => {
  const source = sharp(options.original, {
    limitInputPixels: MAX_INPUT_PIXELS,
  }).rotate();
  const metadata = await source.metadata();
  const { data, info } = await source
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const raw: RawImage = {
    data,
    width: info.width,
    height: info.height,
    channels: info.channels,
  };

  const layout = scaleLayout(options.layout, info.width, info.height);
  const ordered = [...layout.regions].sort((a, b) => a.order - b.order);

  // Pass 1: resolve and paint every mask before any text is placed, so an
  // overlapping neighbour cannot paint over typeset glyphs.
  const facts = new Map<string, ResolvedRegionFacts>();
  const resolved: Region[] = ordered.map((region) => {
    if (region.hidden) return region;
    const result = resolveRegionMask(raw, region);
    facts.set(region.id, result.facts);
    return result.region;
  });
  for (const region of resolved) {
    const fill = facts.get(region.id)?.fillColor;
    if (!shouldClean(region) || !fill) continue;
    applyFill(raw, region.mask, fill);
    // A found interior that stops short of the text box (leaky outline, tail)
    // would leave glyph fragments; the text box itself is always safe to paint.
    if (region.mask.type === "polygon" && !polygonCoversBox(region.mask.points, region.textBox)) {
      fillRoundedRect(raw, expandBox(region.textBox, 0.06, 0.1), 0.25, fill);
      facts.get(region.id)?.maskDiagnostics?.push("interior did not cover the text box; text box painted too");
    }
  }

  // Pass 2: typeset.
  const plans: RegionPlan[] = resolved
    .filter((region) => !region.hidden && region.translatedText.trim())
    .map((region) => planRegion(region, layout, options.fonts, facts.get(region.id)));

  const svg = buildOverlaySvg({
    width: raw.width,
    height: raw.height,
    plans,
  });

  const composed = sharp(raw.data, {
    raw: { width: raw.width, height: raw.height, channels: raw.channels as 3 | 4 },
    limitInputPixels: MAX_INPUT_PIXELS,
  }).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]);

  const format =
    options.format === "auto" || !options.format
      ? metadata.format === "png"
        ? "png"
        : "jpeg"
      : options.format;
  const image =
    format === "png"
      ? await composed.png({ compressionLevel: 8 }).toBuffer()
      : await composed
          .jpeg({ quality: options.quality ?? 92, mozjpeg: true })
          .toBuffer();

  const infoById = new Map(plans.map((plan) => [plan.region.id, plan.info]));
  const finalLayout: PageLayout = {
    ...layout,
    regions: resolved.map((region) => ({
      ...region,
      render: infoById.get(region.id),
    })),
    meta: { ...layout.meta, updatedAt: new Date().toISOString() },
  };

  return {
    image,
    contentType: format === "png" ? "image/png" : "image/jpeg",
    layout: finalLayout,
    svg,
    width: raw.width,
    height: raw.height,
  };
};
