import { fontSizeBounds } from "./defaults";
import { FontSet, LoadedFont } from "./fontEngine";
import {
  Chord,
  ellipseShape,
  insetShape,
  localeForLanguage,
  polygonShape,
  polygonSpans,
  rectShape,
  roundedRectShape,
  Shape,
  typesetText,
  TypesetResult,
} from "./typeset";
import {
  Box,
  clampBox,
  insetBox,
  isContainerKind,
  maskBounds,
  PageLayout,
  Point,
  Region,
  RegionRenderInfo,
} from "./types";

/**
 * Turns a region plus the pixel facts the renderer resolved (fill colour,
 * background luminance) into a concrete typesetting plan. This module is
 * isomorphic: the browser editor uses it for live preview with the values
 * cached in `region.render`.
 */

export interface ResolvedRegionFacts {
  /** Colour painted into the mask, if the region was cleaned. */
  fillColor?: string;
  /** Luminance (0-255) of the surface the text will sit on. */
  surfaceLuma?: number;
  maskConfidence?: number;
  /** Why automatic interior detection fell back to a geometric mask. */
  maskDiagnostics?: string[];
}

export interface Badge {
  box: Box;
  color: string;
  opacity: number;
  radius: number;
}

export interface RegionPlan {
  region: Region;
  area: Box;
  shape: Shape;
  typeset: TypesetResult | null;
  font: LoadedFont;
  textColor: string;
  strokeColor: string | "none";
  /** Pixels. */
  strokeWidth: number;
  badge?: Badge;
  info: RegionRenderInfo;
}

const LABEL_GAP_RATIO = 0.012;

const contrastingText = (luma: number) => (luma >= 128 ? "#111111" : "#ffffff");
const contrastingStroke = (luma: number) => (luma >= 128 ? "#ffffff" : "#111111");

const percentile = (values: number[], ratio: number) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.round((sorted.length - 1) * Math.min(1, Math.max(0, ratio)))];
};

/**
 * Usable text rectangle inside a cleaned interior: the body of the lobe that
 * holds `focus` (the region's text), without tails, pointed ends or a
 * connector to a linked balloon. Rows narrower than 55% of the lobe's widest
 * are ignored.
 */
export const interiorTextArea = (points: Point[], focus?: Point): Box | null => {
  const b = polygonShape(points).bounds;
  const fx = focus?.[0] ?? b.x + b.w / 2;
  const fy = focus?.[1] ?? b.y + b.h / 2;
  const samples = 64;
  type Row = Chord & { y: number };
  const distance = (chord: Chord) => Math.min(Math.abs(chord.left - fx), Math.abs(chord.right - fx));
  const rows: (Row | null)[] = [];
  for (let i = 0; i <= samples; i += 1) {
    const y = b.y + (b.h * i) / samples;
    const spans = polygonSpans(points, y);
    // The span holding the text, or the nearest one on rows it misses.
    const span =
      spans.find((candidate) => candidate.left <= fx && fx <= candidate.right) ||
      spans.reduce<Chord | null>(
        (nearest, candidate) => (!nearest || distance(candidate) < distance(nearest) ? candidate : nearest),
        null,
      );
    rows.push(span && span.right > span.left ? { y, ...span } : null);
  }
  const width = (index: number) => rows[index]!.right - rows[index]!.left;
  let start = Math.round(((fy - b.y) / Math.max(1, b.h)) * samples);
  start = Math.min(samples, Math.max(0, start));
  if (!rows[start]) {
    const nearest = rows.findIndex((row, index) => row && Math.abs(index - start) <= 3);
    if (nearest < 0) return null;
    start = nearest;
  }
  // Grow the lobe while rows stay wider than 40% of the widest seen: a neck
  // to a linked balloon or a tail is far narrower than the body.
  let top = start;
  let bottom = start;
  let widest = width(start);
  for (let grew = true; grew; ) {
    grew = false;
    if (top > 0 && rows[top - 1] && width(top - 1) >= widest * 0.4) {
      top -= 1;
      widest = Math.max(widest, width(top));
      grew = true;
    }
    if (bottom < samples && rows[bottom + 1] && width(bottom + 1) >= widest * 0.4) {
      bottom += 1;
      widest = Math.max(widest, width(bottom));
      grew = true;
    }
  }
  const body = rows
    .slice(top, bottom + 1)
    .filter((row): row is Row => !!row)
    .filter((row) => row.right - row.left >= widest * 0.55);
  if (body.length < 3) return null;
  // Wrapping follows the container's chords (clippedPolygonShape), so the
  // rectangle only needs to drop outliers, not the curvature: trimming to
  // the inner edges starves tall, narrow manga balloons.
  const left = percentile(body.map((row) => row.left), 0.15);
  const right = percentile(body.map((row) => row.right), 0.85);
  const areaTop = body[0].y;
  const areaBottom = body[body.length - 1].y;
  if (right <= left || areaBottom <= areaTop) return null;
  // A hair off the outline; the style padding adds the real margin.
  const padX = (right - left) * 0.02;
  const padY = (areaBottom - areaTop) * 0.02;
  return {
    x: left + padX,
    y: areaTop + padY,
    w: right - left - padX * 2,
    h: areaBottom - areaTop - padY * 2,
  };
};

/** Polygon chords limited to a rectangle, from the span that overlaps it most. */
const clippedPolygonShape = (points: Point[], box: Box): Shape => ({
  bounds: box,
  chordAt: (y) => {
    if (y < box.y || y > box.y + box.h) return null;
    let best: Chord | null = null;
    for (const span of polygonSpans(points, y)) {
      const left = Math.max(span.left, box.x);
      const right = Math.min(span.right, box.x + box.w);
      if (right > left && (!best || right - left > best.right - best.left)) best = { left, right };
    }
    return best;
  },
});

/** A shape's chords limited to a rectangle. */
const clippedShape = (shape: Shape, box: Box): Shape => ({
  bounds: box,
  chordAt: (y) => {
    if (y < box.y || y > box.y + box.h) return null;
    const chord = shape.chordAt(y);
    if (!chord) return null;
    const left = Math.max(chord.left, box.x);
    const right = Math.min(chord.right, box.x + box.w);
    return right > left ? { left, right } : null;
  },
});

const centreOf = (box: Box): Point => [box.x + box.w / 2, box.y + box.h / 2];

/**
 * Two regions can share one container (a balloon the detector split in two,
 * or two blocks the reading model kept apart). Each then gets the part of
 * the room on its side of the midline between the two texts, so the
 * translations never overlap.
 */
const shareRoom = (region: Region, room: Box, layout: PageLayout): Box => {
  const box = { ...room };
  const own = region.textBox;
  const [ox, oy] = centreOf(own);
  for (const other of layout.regions) {
    if (
      other.id === region.id ||
      other.hidden ||
      other.placement !== "inside" ||
      !other.translatedText.trim()
    ) {
      continue;
    }
    const t = other.textBox;
    const [tx, ty] = centreOf(t);
    if (tx < box.x || tx > box.x + box.w || ty < box.y || ty > box.y + box.h) continue;
    const dx = tx - ox;
    const dy = ty - oy;
    if (Math.abs(dy) * box.w >= Math.abs(dx) * box.h) {
      const cut = dy > 0 ? (own.y + own.h + t.y) / 2 : (t.y + t.h + own.y) / 2;
      if (cut <= box.y || cut >= box.y + box.h) continue;
      if (dy > 0) box.h = cut - box.y;
      else {
        box.h = box.y + box.h - cut;
        box.y = cut;
      }
    } else {
      const cut = dx > 0 ? (own.x + own.w + t.x) / 2 : (t.x + t.w + own.x) / 2;
      if (cut <= box.x || cut >= box.x + box.w) continue;
      if (dx > 0) box.w = cut - box.x;
      else {
        box.w = box.x + box.w - cut;
        box.x = cut;
      }
    }
  }
  return box;
};

/**
 * Wrapping silhouette. Automatic shapes follow the cleaned container, so
 * lines get shorter towards the top and bottom of a round balloon; an
 * ellipse inscribed in a box would waste a fifth of the room.
 */
const shapeFor = (region: Region, base: Box): Shape => {
  const { style, mask } = region;
  if (style.shape === "ellipse") return ellipseShape(base);
  if (style.shape === "rect" || region.textArea || region.placement !== "inside") {
    return rectShape(base);
  }
  if (mask.type === "polygon") return clippedPolygonShape(mask.points, base);
  if (mask.type === "ellipse") return clippedShape(ellipseShape(mask.box), base);
  if (mask.type === "rect") return clippedShape(roundedRectShape(mask.box, mask.radius ?? 0), base);
  return rectShape(base);
};

/** The box text is fitted into before padding. */
export const baseAreaFor = (region: Region, layout: PageLayout): Box => {
  if (region.placement === "inside") {
    if (region.textArea) return clampBox(region.textArea, layout.width, layout.height);
    // The cleaned container is the room the translation has.
    if (region.mask.type === "polygon") {
      const body = interiorTextArea(region.mask.points, centreOf(region.textBox));
      if (body) return clampBox(shareRoom(region, body, layout), layout.width, layout.height);
    }
    const bounds = maskBounds(region.mask);
    if (bounds) return clampBox(shareRoom(region, bounds, layout), layout.width, layout.height);
    // Not cleaned: the text goes over the artwork where the source was, or
    // into the balloon bounds a model reported.
    const area =
      (region.bubbleBox
        ? insetBox(region.bubbleBox, region.bubbleBox.w * 0.06, region.bubbleBox.h * 0.08)
        : null) || region.textBox;
    return clampBox(area, layout.width, layout.height);
  }
  const { min, max } = fontSizeBounds(region, layout.width);
  const source = region.textBox;
  const gap = layout.width * LABEL_GAP_RATIO;
  const height = Math.max(min * 1.7, Math.min(source.h * 0.55, max * 1.9));
  const width = Math.max(source.w * 1.15, min * 6);
  const x = source.x + source.w / 2 - width / 2;
  const y =
    region.placement === "below"
      ? source.y + source.h + gap
      : source.y - gap - height;
  const box = { x, y, w: width, h: height };
  // Keep labels on the page: flip side when there is no room.
  if (box.y < 0) box.y = source.y + source.h + gap;
  if (box.y + box.h > layout.height) box.y = Math.max(0, source.y - gap - height);
  return clampBox(box, layout.width, layout.height);
};

export const planRegion = (
  region: Region,
  layout: PageLayout,
  fonts: FontSet,
  facts: ResolvedRegionFacts = {},
): RegionPlan => {
  const { style } = region;
  const font = fonts.resolve(style.fontFamily, style.weight, style.italic);
  const base = region.textArea
    ? clampBox(region.textArea, layout.width, layout.height)
    : baseAreaFor(region, layout);
  const rawShape = shapeFor(region, base);
  const shape = insetShape(
    rawShape,
    rawShape.bounds.w * style.padding,
    rawShape.bounds.h * style.padding,
  );
  const bounds = fontSizeBounds(region, layout.width);
  const typeset = typesetText({
    text: region.translatedText,
    shape,
    style,
    metrics: font.metrics,
    minFontSize: bounds.min,
    maxFontSize: bounds.max,
    locale: localeForLanguage(layout.meta.targetLanguage),
  });

  const cleaned =
    region.placement === "inside" &&
    region.fill.mode !== "none" &&
    region.mask.type !== "none";
  const surfaceLuma =
    facts.surfaceLuma ?? (cleaned ? 255 : isContainerKind(region.kind) ? 255 : 128);
  const textColor =
    style.color === "auto" ? contrastingText(surfaceLuma) : style.color;
  const overArtwork = !cleaned;
  const strokeColor =
    style.strokeColor === "none"
      ? "none"
      : style.strokeColor === "auto"
        ? overArtwork && !region.style.badge
          ? contrastingStroke(surfaceLuma)
          : "none"
        : style.strokeColor;
  const fontSize = typeset?.fontSize ?? bounds.min;
  const strokeWidthRatio =
    style.strokeWidth > 0
      ? style.strokeWidth
      : strokeColor !== "none"
        ? 0.12
        : 0;
  const strokeWidth = strokeColor === "none" ? 0 : fontSize * strokeWidthRatio;

  let badge: Badge | undefined;
  if (style.badge && region.placement !== "inside" && typeset) {
    const padX = fontSize * 0.45;
    const padY = fontSize * 0.22;
    badge = {
      box: {
        x: typeset.block.x - padX,
        y: typeset.block.y - padY,
        w: typeset.block.w + padX * 2,
        h: typeset.block.h + padY * 2,
      },
      color: style.badge.color,
      opacity: style.badge.opacity,
      radius: style.badge.radius,
    };
  }

  const info: RegionRenderInfo = {
    fontSize,
    lineHeight: typeset?.lineHeight ?? fontSize * style.lineHeight,
    lines: typeset?.lines.map((line) => line.text) ?? [],
    area: rawShape.bounds,
    fillColor: facts.fillColor,
    textColor,
    strokeColor,
    overflow: typeset?.overflow ?? true,
    maskConfidence: facts.maskConfidence,
    maskDiagnostics: facts.maskDiagnostics?.length ? facts.maskDiagnostics : undefined,
  };

  return {
    region,
    area: rawShape.bounds,
    shape,
    typeset,
    font,
    textColor,
    strokeColor,
    strokeWidth,
    badge,
    info,
  };
};
