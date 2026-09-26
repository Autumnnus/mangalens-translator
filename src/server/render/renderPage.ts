import sharp from "sharp";
import { scaleLayout } from "@/layout/defaults";
import { polygonShape, polygonSpans } from "@/layout/typeset";
import { FontSet } from "@/layout/fontEngine";
import { planRegion, RegionPlan, ResolvedRegionFacts } from "@/layout/plan";
import { buildOverlaySvg } from "@/layout/svg";
import {
  Box,
  insetBox,
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
  findInteriorByFlood,
  hexToRgb,
  InteriorResult,
  polygonArea,
  RawImage,
  sampleBoxColor,
  sampleRingColor,
  sampleTextBackground,
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

/** An interior this many times larger than its text has spread into artwork. */
const MAX_INTERIOR_TO_TEXT = 10;

const shouldClean = (region: Region) =>
  !region.hidden &&
  region.placement === "inside" &&
  region.fill.mode !== "none" &&
  region.mask.type !== "none";

const luma = (hex: string) => {
  const [r, g, b] = hexToRgb(hex);
  return r * 0.299 + g * 0.587 + b * 0.114;
};

/**
 * Detector boxes (DB unclip) reach past the glyphs, often onto the balloon
 * outline. Seeds, coverage checks and patches use the glyph core instead.
 */
export const glyphCore = (region: Region): Box => {
  if (!region.textBoxPrecise) return region.textBox;
  const margin = (region.sourceLineHeight ?? region.textBox.h / 3) * 0.3;
  return insetBox(
    region.textBox,
    Math.min(margin, region.textBox.w * 0.15),
    Math.min(margin, region.textBox.h * 0.2),
  );
};

/**
 * Bubble painted behind the translation when no container was found (text
 * on artwork, open or broken balloons, captions without a border). The v1
 * renderer did the same with a white rounded rectangle; it reads as a clean
 * balloon, while leaving the source text in place does not.
 */
const fallbackMask = (region: Region, glyphHeight?: number): Mask => {
  const core = glyphCore(region);
  const round = region.kind === "speech" || region.kind === "thought";
  const unit = glyphHeight ?? (region.sourceLineHeight ? region.sourceLineHeight * 0.6 : undefined);
  const padX = unit ? unit * (round ? 0.9 : 0.5) : core.w * (round ? 0.07 : 0.04);
  const padY = unit ? unit * (round ? 0.7 : 0.4) : core.h * (round ? 0.1 : 0.06);
  const box = { x: core.x - padX, y: core.y - padY, w: core.w + padX * 2, h: core.h + padY * 2 };
  // The rounded corners must not cut into the glyph core.
  const shorter = Math.max(1, Math.min(box.w, box.h));
  const radius = Math.min(shorter * (round ? 0.45 : 0.12), 3.3 * Math.min(padX, padY));
  return { type: "rect", box, radius: Math.max(0, radius / shorter) };
};

/**
 * Container interior around the text. The permissive flood fill goes first
 * because glyph gaps do not stop it; the outline search (erosion, several
 * seeds) handles dashed, hatched and dark balloons the flood reports as leaks.
 */
const findInterior = (
  raw: RawImage,
  region: Region,
  diagnostics: string[],
): InteriorResult | null => {
  const core = glyphCore(region);
  const accept = (result: InteriorResult | null, label: string) => {
    if (!result) return null;
    const area = polygonArea(result.polygon);
    const limit = region.bubbleBox
      ? region.bubbleBox.w * region.bubbleBox.h * 2.6
      : region.textBox.w * region.textBox.h * MAX_INTERIOR_TO_TEXT;
    if (area > limit) {
      diagnostics.push(`${label}: rejected, interior is ${Math.round(area / Math.max(1, core.w * core.h))}x the text`);
      return null;
    }
    // The interior has to hold the text, not sit next to it.
    const centre = core.x + core.w / 2;
    const holdsText = polygonSpans(result.polygon, core.y + core.h / 2).some(
      (span) => span.left <= centre && centre <= span.right,
    );
    if (!holdsText) {
      diagnostics.push(`${label}: rejected, interior does not contain the text`);
      return null;
    }
    diagnostics.push(`${label}: interior found`);
    return result;
  };
  return (
    accept(findInteriorByFlood(raw, core, { diagnostics }), "flood") ||
    accept(
      detectBubbleInterior(raw, region.textBox, { hint: region.bubbleBox, diagnostics }),
      "outline search",
    )
  );
};

export const resolveRegionMask = (
  raw: RawImage,
  region: Region,
): { region: Region; facts: ResolvedRegionFacts } => {
  if (!shouldClean(region)) {
    const surface = sampleBoxColor(raw, region.textBox);
    return { region, facts: { surfaceLuma: surface.luma } };
  }

  if (region.mask.type !== "auto") {
    const ring = sampleRingColor(raw, region.textBox);
    const fillColor =
      region.fill.mode === "color" && region.fill.color ? region.fill.color : ring.color;
    return { region, facts: { fillColor, surfaceLuma: ring.luma } };
  }

  const diagnostics: string[] = [];
  const colorOverride =
    region.fill.mode === "color" && region.fill.color ? region.fill.color : undefined;
  // Model boxes drift on real scans: align the box with the glyphs first.
  // Boxes the user placed by hand (manual source, or already snapped once)
  // and pixel-accurate detector boxes are left alone.
  let working = region;
  let glyphHeight: number | undefined;
  let snapped = false;
  if (
    region.source !== "manual" &&
    !region.detectorBox &&
    !region.textBoxPrecise &&
    !region.locked &&
    (isContainerKind(region.kind) || region.kind === "label")
  ) {
    const snap = snapTextBoxToInk(raw, region.textBox, diagnostics);
    if (snap) {
      working = { ...region, textBox: snap.box, detectorBox: region.textBox };
      glyphHeight = snap.glyphHeight;
      snapped = true;
      diagnostics.push(
        `text box snapped to ink (${Math.round(snap.box.x - region.textBox.x)}, ${Math.round(snap.box.y - region.textBox.y)} px, conf ${snap.confidence.toFixed(2)})`,
      );
    }
  }

  if (isContainerKind(working.kind) || working.kind === "label") {
    const interior = findInterior(raw, working, diagnostics);
    if (interior) {
      const fillColor = colorOverride || interior.fillColor;
      return {
        region: { ...working, mask: { type: "polygon", points: interior.polygon } },
        facts: {
          fillColor,
          surfaceLuma: colorOverride ? luma(colorOverride) : interior.luma,
          maskConfidence: interior.confidence,
          maskDiagnostics: diagnostics,
        },
      };
    }
  }

  // No closed container. A box that is known to sit on lettering (pixel
  // detector, OCR worker, ink snap, hand edit) gets a bubble behind the
  // translation. An unverified model box over artwork may be off the text
  // entirely, so it is left alone and the text gets a contrasting stroke.
  const ring = sampleRingColor(raw, working.textBox);
  const paperLike = ring.luma >= 200 && ring.brightFraction >= 0.65;
  const onLettering =
    !!working.textBoxPrecise || snapped || working.source === "manual" || !!working.locked;
  if (!onLettering && !paperLike) {
    diagnostics.push(
      `no fallback paint: unverified box over artwork (luma ${ring.luma.toFixed(0)}, bright ${(ring.brightFraction * 100).toFixed(0)}%)`,
    );
    return {
      region: { ...working, mask: { type: "none" }, maskSource: "fallback" },
      facts: { surfaceLuma: ring.luma, maskConfidence: 0, maskDiagnostics: diagnostics },
    };
  }
  // Flat surroundings (caption boxes, plain balloons) keep their colour;
  // busy artwork gets a white bubble.
  const background = sampleTextBackground(raw, glyphCore(working));
  const fillColor =
    colorOverride || (background.spread <= 40 ? background.color : "#ffffff");
  diagnostics.push(`no container found; bubble painted (${fillColor})`);
  return {
    region: { ...working, mask: fallbackMask(working, glyphHeight), maskSource: "fallback" },
    facts: {
      fillColor,
      surfaceLuma: luma(fillColor),
      maskConfidence: 0.25,
      maskDiagnostics: diagnostics,
    },
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
    // A found interior that stops short of the glyphs (leaky outline, tail)
    // would leave fragments; the glyph core itself is safe to paint. The
    // whole detector box is not: it often reaches onto the outline.
    const core = glyphCore(region);
    if (region.mask.type === "polygon" && !polygonCoversBox(region.mask.points, core)) {
      fillRoundedRect(
        raw,
        { x: core.x - core.w * 0.03, y: core.y - core.h * 0.06, w: core.w * 1.06, h: core.h * 1.12 },
        0.25,
        fill,
      );
      facts.get(region.id)?.maskDiagnostics?.push("interior did not cover the glyphs; glyph core painted too");
    }
  }

  // Pass 2: typeset.
  const plans: RegionPlan[] = resolved
    .filter((region) => !region.hidden && region.translatedText.trim())
    // Plans see the resolved neighbours: regions sharing a container split it.
    .map((region) =>
      planRegion(region, { ...layout, regions: resolved }, options.fonts, facts.get(region.id)),
    );

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
