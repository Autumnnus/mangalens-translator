import { z } from "zod";
import { FONT_FAMILY_IDS } from "./fonts";

/**
 * Layout v2: a page translation is a document, not an image. The rendered
 * image is always reproducible from this structure, which is why every value
 * here is stored in the original image's pixel space and nothing depends on
 * the viewer's fonts or canvas.
 */
export const LAYOUT_VERSION = 2 as const;

export const REGION_KINDS = [
  "speech",
  "thought",
  "caption",
  "sfx",
  "label",
] as const;
export type RegionKind = (typeof REGION_KINDS)[number];

export const REGION_SOURCES = ["gemini", "ocr", "manual", "legacy"] as const;
export type RegionSource = (typeof REGION_SOURCES)[number];

const finite = z.number().finite();
const coordinate = finite.min(-100_000).max(100_000);
const size = finite.min(0).max(100_000);

export const boxSchema = z.object({
  x: coordinate,
  y: coordinate,
  w: size,
  h: size,
});
export type Box = z.infer<typeof boxSchema>;

export const pointSchema = z.tuple([coordinate, coordinate]);
export type Point = z.infer<typeof pointSchema>;

const colorSchema = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);

export const maskSchema = z.discriminatedUnion("type", [
  /** Resolved from the image at render time, then replaced by the result. */
  z.object({ type: z.literal("auto") }),
  z.object({ type: z.literal("none") }),
  z.object({
    type: z.literal("rect"),
    box: boxSchema,
    /** Corner radius as a fraction (0-0.5) of the shorter side. */
    radius: finite.min(0).max(0.5).optional(),
  }),
  z.object({ type: z.literal("ellipse"), box: boxSchema }),
  z.object({
    type: z.literal("polygon"),
    points: z.array(pointSchema).min(3).max(4000),
  }),
]);
export type Mask = z.infer<typeof maskSchema>;

export const fillSchema = z.object({
  /** auto samples the bubble interior; color uses `color`; none skips cleaning. */
  mode: z.enum(["auto", "color", "none"]),
  color: colorSchema.optional(),
});
export type Fill = z.infer<typeof fillSchema>;

export const regionStyleSchema = z.object({
  fontFamily: z.enum(FONT_FAMILY_IDS),
  /** Pixels in original image space, or auto-fit to the text area. */
  fontSize: z.union([finite.min(4).max(2000), z.literal("auto")]),
  minFontSize: finite.min(4).max(2000).optional(),
  maxFontSize: finite.min(4).max(2000).optional(),
  /** Multiplier of the font size. */
  lineHeight: finite.min(0.6).max(3),
  align: z.enum(["center", "left", "right"]),
  color: z.union([colorSchema, z.literal("auto")]),
  strokeColor: z.union([colorSchema, z.literal("auto"), z.literal("none")]),
  /** Fraction of the font size. */
  strokeWidth: finite.min(0).max(1),
  weight: z.enum(["regular", "bold"]),
  italic: z.boolean(),
  uppercase: z.boolean(),
  /** In em units. */
  letterSpacing: finite.min(-0.2).max(1),
  /** Inset of the text area as a fraction of its width/height. */
  padding: finite.min(0).max(0.45),
  /** Wrapping silhouette. auto follows the mask shape. */
  shape: z.enum(["auto", "rect", "ellipse"]),
  /** Degrees, around the text area centre. */
  rotation: finite.min(-180).max(180),
  /** Optional pill drawn behind text placed outside a bubble (sfx labels). */
  badge: z
    .object({
      color: colorSchema,
      opacity: finite.min(0).max(1),
      radius: finite.min(0).max(0.5),
    })
    .optional(),
});
export type RegionStyle = z.infer<typeof regionStyleSchema>;

export const regionRenderInfoSchema = z.object({
  fontSize: finite,
  lineHeight: finite,
  lines: z.array(z.string()),
  area: boxSchema,
  fillColor: colorSchema.optional(),
  textColor: colorSchema,
  strokeColor: z.union([colorSchema, z.literal("none")]),
  overflow: z.boolean(),
  maskConfidence: finite.min(0).max(1).optional(),
  maskDiagnostics: z.array(z.string().max(300)).max(20).optional(),
});
export type RegionRenderInfo = z.infer<typeof regionRenderInfoSchema>;

export const regionSchema = z.object({
  id: z.string().min(1).max(64),
  kind: z.enum(REGION_KINDS),
  /** Reading order, ascending. */
  order: z.number().int().min(0).max(10_000),
  /** Where the source text sits. Produced by the detector or OCR, then snapped to the ink. */
  textBox: boxSchema,
  /** The detector's raw box, kept when `textBox` was snapped to the pixels. */
  detectorBox: boxSchema.optional(),
  /** textBox came from a pixel-accurate detector; do not move it. */
  textBoxPrecise: z.boolean().optional(),
  /** Height of one source text line in px; guides the translated font size. */
  sourceLineHeight: finite.min(1).max(5000).optional(),
  /** Container bounds when the detector knows them. */
  bubbleBox: boxSchema.optional(),
  /** Manual override of the typesetting area. */
  textArea: boxSchema.optional(),
  /** inside places text in the cleaned area; below/above places a label next to it. */
  placement: z.enum(["inside", "below", "above"]),
  mask: maskSchema,
  /** auto: found in the pixels; fallback: geometric guess; manual: edited. */
  maskSource: z.enum(["auto", "fallback", "manual"]),
  fill: fillSchema,
  sourceText: z.string().max(5000),
  translatedText: z.string().max(5000),
  style: regionStyleSchema,
  source: z.enum(REGION_SOURCES),
  confidence: finite.min(0).max(1).optional(),
  /** Manual edits: automation must not overwrite this region. */
  locked: z.boolean().optional(),
  /** Keep the region for reference but render nothing. */
  hidden: z.boolean().optional(),
  notes: z.string().max(2000).optional(),
  /** Written by the renderer; informational only. */
  render: regionRenderInfoSchema.optional(),
});
export type Region = z.infer<typeof regionSchema>;

export const pageLayoutSchema = z.object({
  version: z.literal(LAYOUT_VERSION),
  width: z.number().int().min(1).max(50_000),
  height: z.number().int().min(1).max(50_000),
  regions: z.array(regionSchema).max(500),
  meta: z.object({
    createdAt: z.string(),
    updatedAt: z.string(),
    source: z.enum(REGION_SOURCES).optional(),
    /** e.g. "gemini:gemini-2.5-flash", "paddleocr", "legacy-bubbles". */
    detector: z.string().max(200).optional(),
    targetLanguage: z.string().max(100).optional(),
  }),
});
export type PageLayout = z.infer<typeof pageLayoutSchema>;

export const isContainerKind = (kind: RegionKind) =>
  kind === "speech" || kind === "thought" || kind === "caption";

export const boxRight = (box: Box) => box.x + box.w;
export const boxBottom = (box: Box) => box.y + box.h;
export const boxCenter = (box: Box): Point => [
  box.x + box.w / 2,
  box.y + box.h / 2,
];

export const insetBox = (box: Box, dx: number, dy: number): Box => ({
  x: box.x + dx,
  y: box.y + dy,
  w: Math.max(0, box.w - dx * 2),
  h: Math.max(0, box.h - dy * 2),
});

export const clampBox = (box: Box, width: number, height: number): Box => {
  const x = Math.min(Math.max(0, box.x), width);
  const y = Math.min(Math.max(0, box.y), height);
  return {
    x,
    y,
    w: Math.max(0, Math.min(box.w, width - x)),
    h: Math.max(0, Math.min(box.h, height - y)),
  };
};

export const polygonBounds = (points: Point[]): Box => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
};

export const maskBounds = (mask: Mask): Box | null => {
  switch (mask.type) {
    case "rect":
    case "ellipse":
      return mask.box;
    case "polygon":
      return polygonBounds(mask.points);
    default:
      return null;
  }
};
