import { fontSizeBounds } from "./defaults";
import { FontSet, LoadedFont } from "./fontEngine";
import {
  ellipseShape,
  insetShape,
  polygonShape,
  rectShape,
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

const shapeFor = (region: Region, base: Box): Shape => {
  const { style, mask } = region;
  const wantsEllipse =
    style.shape === "ellipse" ||
    (style.shape === "auto" && (region.kind === "speech" || region.kind === "thought"));
  if (region.textArea) {
    return wantsEllipse ? ellipseShape(base) : rectShape(base);
  }
  if (
    style.shape === "auto" &&
    region.placement === "inside" &&
    region.maskSource !== "fallback" &&
    !region.textBoxPrecise
  ) {
    if (mask.type === "polygon") return polygonShape(mask.points);
    if (mask.type === "ellipse") return ellipseShape(mask.box);
    if (mask.type === "rect") return rectShape(mask.box);
  }
  return wantsEllipse ? ellipseShape(base) : rectShape(base);
};

/** The box text is fitted into before padding. */
export const baseAreaFor = (region: Region, layout: PageLayout): Box => {
  if (region.placement === "inside") {
    if (region.textArea) return clampBox(region.textArea, layout.width, layout.height);
    // A pixel-accurate source box: keep the translation where the letterer put
    // the text, with some room to grow, but never past the cleaned interior.
    if (region.textBoxPrecise) {
      const grown = {
        x: region.textBox.x - region.textBox.w * 0.3,
        y: region.textBox.y - region.textBox.h * 0.3,
        w: region.textBox.w * 1.6,
        h: region.textBox.h * 1.6,
      };
      const bounds = maskBounds(region.mask);
      const limited = bounds
        ? {
            x: Math.max(grown.x, bounds.x),
            y: Math.max(grown.y, bounds.y),
            w: Math.min(grown.x + grown.w, bounds.x + bounds.w) - Math.max(grown.x, bounds.x),
            h: Math.min(grown.y + grown.h, bounds.y + bounds.h) - Math.max(grown.y, bounds.y),
          }
        : grown;
      // A found interior that is smaller than the text itself is not the
      // balloon (a letter counter, a stray white patch): ignore it.
      const usable =
        limited.w > 4 &&
        limited.h > 4 &&
        limited.w * limited.h >= region.textBox.w * region.textBox.h * 0.6;
      return clampBox(usable ? limited : grown, layout.width, layout.height);
    }
    // A geometric fallback mask only covers the source text; the detector's
    // balloon bounds are a better estimate of the room the translation has.
    const area =
      (region.maskSource === "fallback" && region.bubbleBox
        ? insetBox(region.bubbleBox, region.bubbleBox.w * 0.06, region.bubbleBox.h * 0.08)
        : null) ||
      maskBounds(region.mask) ||
      region.bubbleBox ||
      region.textBox;
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
