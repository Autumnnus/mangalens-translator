import sharp from "sharp";
import { scaleLayout } from "@/layout/defaults";
import { FontSet } from "@/layout/fontEngine";
import { planRegion, RegionPlan, ResolvedRegionFacts } from "@/layout/plan";
import { buildOverlaySvg } from "@/layout/svg";
import {
  Box,
  isContainerKind,
  Mask,
  PageLayout,
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
    const detected =
      isContainerKind(region.kind) || region.kind === "label"
        ? detectBubbleInterior(raw, region.textBox, {
            hint: region.bubbleBox,
            diagnostics,
          })
        : null;
    if (detected) {
      const fillColor =
        region.fill.mode === "color" && region.fill.color
          ? region.fill.color
          : detected.fillColor;
      return {
        region: { ...region, mask: { type: "polygon", points: detected.polygon } },
        facts: {
          fillColor,
          surfaceLuma: detected.luma,
          maskConfidence: detected.confidence,
        },
      };
    }
    const ring = sampleRingColor(raw, region.textBox);
    const fillColor =
      region.fill.mode === "color" && region.fill.color
        ? region.fill.color
        : ring.color;
    return {
      region: { ...region, mask: fallbackMask(region), maskSource: "fallback" },
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
    if (shouldClean(region) && fill) applyFill(raw, region.mask, fill);
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
