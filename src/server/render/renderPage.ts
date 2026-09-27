import sharp from "sharp";
import { fontSizeBounds, scaleLayout } from "@/layout/defaults";
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
  inpaintGlyphs,
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

  if (region.mask.type === "inpaint") {
    const ring = sampleRingColor(raw, region.textBox);
    return { region, facts: { surfaceLuma: ring.luma } };
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
  const background = sampleTextBackground(raw, glyphCore(working));
  // One or two lines printed straight on artwork (whispers, breaths, loose
  // dialogue): a bubble would cover far more of the drawing than the
  // original lettering did. Remove just the glyphs and stroke the
  // translation in their place, the way letterers handle floating text.
  const lineHeight = working.sourceLineHeight ?? glyphHeight;
  const lines = lineHeight ? Math.min(working.textBox.w, working.textBox.h) / lineHeight : Infinity;
  // White, flat paper behind the letters is a balloon the interior search
  // missed (spiky, open, touching a border): painting it is exact there.
  // Both the gaps between the letters and the ring around them must be
  // near-white: a white letter outline alone is not paper.
  const whitePaper = background.luma >= 232 && background.spread <= 25 && ring.luma >= 225;
  if (!colorOverride && !whitePaper && lines <= 2.4) {
    diagnostics.push(`floating text on artwork (${lines.toFixed(1)} lines): glyphs inpainted`);
    return {
      region: { ...working, mask: { type: "inpaint" }, maskSource: "fallback" },
      facts: { surfaceLuma: ring.luma, maskConfidence: 0.4, maskDiagnostics: diagnostics },
    };
  }
  // Flat surroundings (caption boxes, plain balloons) keep their colour;
  // busy artwork gets a white bubble.
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

/** True when the non-fill pixels around a box are flat (no halftone, no hatching). */
const surroundingIsSmooth = (raw: RawImage, left: number, top: number, right: number, bottom: number, fill: string) => {
  const [fr, fg, fb] = hexToRgb(fill);
  const values: number[] = [];
  for (let y = top - 5; y <= bottom + 5; y += 1) {
    for (let x = left - 5; x <= right + 5; x += 1) {
      const outside = y < top - 1 || y > bottom + 1 || x < left - 1 || x > right + 1;
      if (!outside || x < 0 || y < 0 || x >= raw.width || y >= raw.height) continue;
      const o = (y * raw.width + x) * raw.channels;
      if (Math.abs(raw.data[o] - fr) + Math.abs(raw.data[o + 1] - fg) + Math.abs(raw.data[o + 2] - fb) <= 60) continue;
      values.push(raw.data[o] * 0.299 + raw.data[o + 1] * 0.587 + raw.data[o + 2] * 0.114);
    }
  }
  if (values.length < 8) return true;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const deviation = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
  return deviation < 28;
};

/** True when some of the pixels just around a box have the fill colour (it borders the cleaned area). */
const ringTouchesFill = (raw: RawImage, left: number, top: number, right: number, bottom: number, fill: string) => {
  const [fr, fg, fb] = hexToRgb(fill);
  let matching = 0;
  let total = 0;
  for (let y = top - 3; y <= bottom + 3; y += 1) {
    for (let x = left - 3; x <= right + 3; x += 1) {
      const onRing = y === top - 3 || y === bottom + 3 || x === left - 3 || x === right + 3;
      if (!onRing || x < 0 || y < 0 || x >= raw.width || y >= raw.height) continue;
      const o = (y * raw.width + x) * raw.channels;
      total += 1;
      if (Math.abs(raw.data[o] - fr) + Math.abs(raw.data[o + 1] - fg) + Math.abs(raw.data[o + 2] - fb) <= 60) matching += 1;
    }
  }
  return total > 0 && matching / total >= 0.15;
};

/** True when most pixels just around a box have the fill colour. */
const ringMatchesFill = (raw: RawImage, left: number, top: number, right: number, bottom: number, fill: string) => {
  const [fr, fg, fb] = hexToRgb(fill);
  let total = 0;
  let matching = 0;
  const check = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= raw.width || y >= raw.height) return;
    const offset = (y * raw.width + x) * raw.channels;
    total += 1;
    const distance = Math.abs(raw.data[offset] - fr) + Math.abs(raw.data[offset + 1] - fg) + Math.abs(raw.data[offset + 2] - fb);
    if (distance <= 60) matching += 1;
  };
  const x0 = left - 3;
  const x1 = right + 3;
  const y0 = top - 3;
  const y1 = bottom + 3;
  for (let x = x0; x <= x1; x += 1) {
    check(x, y0);
    check(x, y1);
  }
  for (let y = y0 + 1; y < y1; y += 1) {
    check(x0, y);
    check(x1, y);
  }
  return total > 0 && matching / total >= 0.7;
};

/**
 * Safety net after cleaning: any glyph-sized ink left inside the detector
 * box (a letter that poked past the found interior) is painted over with
 * the fill. Components touching the box edge are outlines or artwork
 * crossing it and stay. Returns the number of patches.
 */
const eraseResidualGlyphs = (raw: RawImage, region: Region, fill: string) => {
  const box = region.textBox;
  const x0 = Math.max(0, Math.floor(box.x));
  const y0 = Math.max(0, Math.floor(box.y));
  const x1 = Math.min(raw.width, Math.ceil(box.x + box.w));
  const y1 = Math.min(raw.height, Math.ceil(box.y + box.h));
  const width = x1 - x0;
  const height = y1 - y0;
  if (width < 3 || height < 3) return 0;
  const fillLuma = luma(fill);
  const darkFill = fillLuma < 128;
  const ink = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = ((y0 + y) * raw.width + x0 + x) * raw.channels;
      const value = raw.data[offset] * 0.299 + raw.data[offset + 1] * 0.587 + raw.data[offset + 2] * 0.114;
      ink[y * width + x] = (darkFill ? value - fillLuma : fillLuma - value) > 90 ? 1 : 0;
    }
  }
  const glyphLimit = Math.max(4, (region.sourceLineHeight ?? height) * 1.2);
  const core = glyphCore(region);
  const reach = (region.sourceLineHeight ?? core.h / 3) * 0.2;
  const seen = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let patches = 0;
  for (let start = 0; start < ink.length; start += 1) {
    if (!ink[start] || seen[start]) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    seen[start] = 1;
    let minX = width;
    let maxX = -1;
    let minY = height;
    let maxY = -1;
    while (head < tail) {
      const index = queue[head++];
      const x = index % width;
      const y = (index - x) / width;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (const next of [x > 0 ? index - 1 : -1, x < width - 1 ? index + 1 : -1, y > 0 ? index - width : -1, y < height - 1 ? index + width : -1]) {
        if (next >= 0 && ink[next] && !seen[next]) {
          seen[next] = 1;
          queue[tail++] = next;
        }
      }
    }
    const touchesEdge = minX === 0 || minY === 0 || maxX === width - 1 || maxY === height - 1;
    const glyphSized = maxX - minX + 1 <= glyphLimit && maxY - minY + 1 <= glyphLimit && tail >= 3;
    // Only where the lettering was: detail of the artwork next to the text
    // can fall inside the (inflated) detector box too.
    const cx = x0 + (minX + maxX) / 2;
    const cy = y0 + (minY + maxY) / 2;
    const inLettering =
      cx >= core.x - reach && cx <= core.x + core.w + reach && cy >= core.y - reach && cy <= core.y + core.h + reach;
    if (touchesEdge || !glyphSized || !inLettering) continue;
    // A leftover letter on the cleaned surface is painted with the fill. One
    // that pokes past the container (a letter drawn over the frame) is
    // inpainted from its own surroundings instead, which keeps the frame.
    if (!ringMatchesFill(raw, x0 + minX, y0 + minY, x0 + maxX, y0 + maxY, fill)) {
      const onFrameEdge = ringTouchesFill(raw, x0 + minX, y0 + minY, x0 + maxX, y0 + maxY, fill);
      // Only on a smooth surface: filling into halftone or hatching smudges it.
      if (onFrameEdge && surroundingIsSmooth(raw, x0 + minX, y0 + minY, x0 + maxX, y0 + maxY, fill)) {
        inpaintGlyphs(raw, { x: x0 + minX - 1, y: y0 + minY - 1, w: maxX - minX + 3, h: maxY - minY + 3 }, glyphLimit / 1.2);
        patches += 1;
      }
      continue;
    }
    // Paint the letter's own pixels (plus one pixel of anti-aliasing), not
    // its bounding box, so an outline right next to it stays intact.
    const [fr, fg, fb] = hexToRgb(fill);
    for (let i = 0; i < tail; i += 1) {
      const index = queue[i];
      const px = index % width;
      const py = (index - px) / width;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x0 + px + dx;
          const ny = y0 + py + dy;
          if (nx < 0 || ny < 0 || nx >= raw.width || ny >= raw.height) continue;
          const offset = (ny * raw.width + nx) * raw.channels;
          const value = raw.data[offset] * 0.299 + raw.data[offset + 1] * 0.587 + raw.data[offset + 2] * 0.114;
          // Neighbours only when they are not ink of something else (an outline).
          if ((dx || dy) && Math.abs(value - fillLuma) > 150) continue;
          raw.data[offset] = fr;
          raw.data[offset + 1] = fg;
          raw.data[offset + 2] = fb;
        }
      }
    }
    patches += 1;
  }
  return patches;
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
    if (!region.hidden && region.placement === "inside" && region.mask.type === "inpaint") {
      inpaintGlyphs(raw, region.textBox, region.sourceLineHeight ? region.sourceLineHeight * 0.6 : undefined);
      continue;
    }
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

  // Pass 1b: nothing of the source lettering may stay visible.
  for (const region of resolved) {
    const fill = facts.get(region.id)?.fillColor;
    if (!shouldClean(region) || !fill) continue;
    const patched = eraseResidualGlyphs(raw, region, fill);
    if (patched > 0) facts.get(region.id)?.maskDiagnostics?.push(`${patched} leftover glyph(s) painted over`);
  }

  // Pass 2: typeset. Text never leaves the cleaned area: a translation that
  // does not fit first gets a smaller minimum size, then a clean backing
  // behind its block instead of spilling onto the artwork.
  const context = { ...layout, regions: resolved };
  const plans: RegionPlan[] = resolved
    .filter((region) => !region.hidden && region.translatedText.trim())
    // Plans see the resolved neighbours: regions sharing a container split it.
    .map((region) => {
      const regionFacts = facts.get(region.id);
      const plan = planRegion(region, context, options.fonts, regionFacts);
      if (!plan.info.overflow || region.style.fontSize !== "auto") return plan;
      const { min } = fontSizeBounds(region, layout.width);
      const smaller = planRegion(
        { ...region, style: { ...region.style, minFontSize: Math.max(7, min * 0.75) } },
        context,
        options.fonts,
        regionFacts,
      );
      const chosen = smaller.info.overflow ? smaller : { ...smaller, region };
      if (chosen.info.overflow && chosen.typeset && shouldClean(region) && regionFacts?.fillColor) {
        const block = chosen.typeset.block;
        const pad = chosen.typeset.fontSize * 0.35;
        fillRoundedRect(
          raw,
          { x: block.x - pad, y: block.y - pad * 0.6, w: block.w + pad * 2, h: block.h + pad * 1.2 },
          0.3,
          regionFacts.fillColor,
        );
        regionFacts.maskDiagnostics?.push("text larger than its container; backing painted behind it");
      }
      return { ...chosen, region };
    });

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
