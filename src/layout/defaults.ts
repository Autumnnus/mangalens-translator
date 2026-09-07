import { FontFamilyId } from "./fonts";
import {
  Box,
  Fill,
  LAYOUT_VERSION,
  Mask,
  PageLayout,
  Region,
  RegionKind,
  RegionSource,
  RegionStyle,
} from "./types";

/**
 * Sound effects are drawn as artwork; painting over them damages the page.
 * The default policy leaves them untouched and typesets the translation as a
 * small label underneath. Each region can switch to "inside" in the editor.
 */
export const SFX_DEFAULT_PLACEMENT: Region["placement"] = "below";

const FAMILY_BY_KIND: Record<RegionKind, FontFamilyId> = {
  speech: "shantell-sans",
  thought: "shantell-sans",
  caption: "nunito",
  sfx: "bangers",
  label: "nunito",
};

export const defaultStyleForKind = (kind: RegionKind): RegionStyle => {
  const base: RegionStyle = {
    fontFamily: FAMILY_BY_KIND[kind],
    fontSize: "auto",
    lineHeight: 1.12,
    align: "center",
    color: "auto",
    strokeColor: "auto",
    strokeWidth: 0,
    weight: "bold",
    italic: false,
    uppercase: false,
    letterSpacing: 0,
    padding: 0.07,
    shape: "auto",
    rotation: 0,
  };
  switch (kind) {
    case "thought":
      return { ...base, italic: true };
    case "caption":
      return { ...base, weight: "bold", padding: 0.08, lineHeight: 1.18 };
    case "label":
      return { ...base, padding: 0.06 };
    case "sfx":
      return {
        ...base,
        uppercase: true,
        lineHeight: 1.0,
        letterSpacing: 0.02,
        strokeWidth: 0.1,
        padding: 0.1,
        badge: { color: "#ffffff", opacity: 0.82, radius: 0.35 },
      };
    default:
      return base;
  }
};

export const defaultMaskForKind = (kind: RegionKind): Mask =>
  kind === "sfx" ? { type: "none" } : { type: "auto" };

export const defaultFillForKind = (kind: RegionKind): Fill =>
  kind === "sfx" ? { mode: "none" } : { mode: "auto" };

export const defaultPlacementForKind = (kind: RegionKind): Region["placement"] =>
  kind === "sfx" ? SFX_DEFAULT_PLACEMENT : "inside";

/** Auto font-size bounds scale with the page so results are resolution independent. */
export const fontSizeBounds = (
  region: Pick<Region, "kind" | "style" | "placement" | "sourceLineHeight">,
  pageWidth: number,
) => {
  const isLabel = region.placement !== "inside";
  const min = region.style.minFontSize ?? Math.max(8, pageWidth * 0.011);
  // When the source lettering size is known, the translation should match it
  // rather than fill the balloon with oversized text.
  const matched =
    region.sourceLineHeight && !isLabel
      ? Math.max(min, region.sourceLineHeight * 1.15)
      : undefined;
  const max =
    region.style.maxFontSize ??
    matched ??
    Math.max(min + 1, pageWidth * (isLabel ? 0.028 : 0.042));
  return { min, max: Math.max(min, max) };
};

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
export const newRegionId = (prefix = "r") => {
  let id = prefix + "_";
  for (let i = 0; i < 8; i += 1) {
    id += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
  }
  return id;
};

export interface CreateRegionInput {
  id?: string;
  kind: RegionKind;
  order: number;
  textBox: Box;
  bubbleBox?: Box;
  sourceText: string;
  translatedText: string;
  source: RegionSource;
  confidence?: number;
  style?: Partial<RegionStyle>;
  textBoxPrecise?: boolean;
  sourceLineHeight?: number;
}

export const createRegion = (input: CreateRegionInput): Region => ({
  id: input.id || newRegionId(),
  kind: input.kind,
  order: input.order,
  textBox: input.textBox,
  bubbleBox: input.bubbleBox,
  placement: defaultPlacementForKind(input.kind),
  mask: defaultMaskForKind(input.kind),
  maskSource: "auto",
  fill: defaultFillForKind(input.kind),
  sourceText: input.sourceText,
  translatedText: input.translatedText,
  style: { ...defaultStyleForKind(input.kind), ...input.style },
  source: input.source,
  confidence: input.confidence,
  textBoxPrecise: input.textBoxPrecise,
  sourceLineHeight: input.sourceLineHeight,
});

export const createLayout = (
  width: number,
  height: number,
  regions: Region[],
  meta: Partial<PageLayout["meta"]> = {},
): PageLayout => {
  const now = new Date().toISOString();
  return {
    version: LAYOUT_VERSION,
    width: Math.round(width),
    height: Math.round(height),
    regions: [...regions].sort((a, b) => a.order - b.order),
    meta: { createdAt: now, updatedAt: now, ...meta },
  };
};

/** Rescales every box, mask and font size when the page dimensions change. */
export const scaleLayout = (
  layout: PageLayout,
  width: number,
  height: number,
): PageLayout => {
  if (layout.width === width && layout.height === height) return layout;
  const sx = width / layout.width;
  const sy = height / layout.height;
  const s = Math.sqrt(sx * sy);
  const box = (b: Box): Box => ({
    x: b.x * sx,
    y: b.y * sy,
    w: b.w * sx,
    h: b.h * sy,
  });
  const mask = (m: Mask): Mask => {
    switch (m.type) {
      case "rect":
        return { ...m, box: box(m.box) };
      case "ellipse":
        return { ...m, box: box(m.box) };
      case "polygon":
        return {
          type: "polygon",
          points: m.points.map(([x, y]) => [x * sx, y * sy]),
        };
      default:
        return m;
    }
  };
  return {
    ...layout,
    width,
    height,
    regions: layout.regions.map((region) => ({
      ...region,
      textBox: box(region.textBox),
      detectorBox: region.detectorBox ? box(region.detectorBox) : undefined,
      bubbleBox: region.bubbleBox ? box(region.bubbleBox) : undefined,
      textArea: region.textArea ? box(region.textArea) : undefined,
      mask: mask(region.mask),
      style: {
        ...region.style,
        fontSize:
          region.style.fontSize === "auto"
            ? "auto"
            : region.style.fontSize * s,
        minFontSize: region.style.minFontSize
          ? region.style.minFontSize * s
          : undefined,
        maxFontSize: region.style.maxFontSize
          ? region.style.maxFontSize * s
          : undefined,
      },
      render: undefined,
    })),
  };
};
