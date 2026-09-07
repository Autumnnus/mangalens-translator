import { TextBubble } from "@/types";
import { createLayout, createRegion } from "./defaults";
import { Box, PageLayout, Region, RegionKind } from "./types";

/**
 * Converts the v1 `images.bubbles` array into a v2 layout. The legacy boxes are
 * normalised to 0-1000, so the page dimensions are required to place them in
 * pixel space. No model call is needed: text and translation are reused.
 */

const KIND_BY_LEGACY_TYPE: Record<string, RegionKind> = {
  speech: "speech",
  dialogue: "speech",
  caption: "caption",
  sfx: "sfx",
  environmental: "sfx",
  label: "label",
};

export const legacyBoxToPixels = (
  box: [number, number, number, number],
  width: number,
  height: number,
): Box => {
  const [ymin, xmin, ymax, xmax] = box;
  const x = (Math.min(xmin, xmax) / 1000) * width;
  const y = (Math.min(ymin, ymax) / 1000) * height;
  return {
    x,
    y,
    w: Math.max(1, (Math.abs(xmax - xmin) / 1000) * width),
    h: Math.max(1, (Math.abs(ymax - ymin) / 1000) * height),
  };
};

export const layoutFromLegacyBubbles = (
  bubbles: TextBubble[],
  width: number,
  height: number,
  meta: Partial<PageLayout["meta"]> = {},
): PageLayout => {
  const regions: Region[] = bubbles
    .filter((bubble) => Array.isArray(bubble.box_2d) && bubble.box_2d.length === 4)
    .map((bubble, index) => {
      const kind = KIND_BY_LEGACY_TYPE[String(bubble.type)] || "speech";
      const textBox = legacyBoxToPixels(bubble.box_2d, width, height);
      // The old client stored its flood-fill result as render_box_2d; it is
      // a usable estimate of the bubble interior when it came from the mask.
      const bubbleBox =
        bubble.render_box_2d && bubble.refinement === "local-mask"
          ? legacyBoxToPixels(bubble.render_box_2d, width, height)
          : undefined;
      return createRegion({
        id: `r_${index + 1}`,
        kind,
        order: index,
        textBox,
        bubbleBox,
        sourceText: String(bubble.original_text || ""),
        translatedText: String(bubble.translated_text || ""),
        source: "legacy",
        confidence:
          typeof bubble.confidence === "number" ? bubble.confidence : undefined,
      });
    });

  return createLayout(width, height, regions, {
    source: "legacy",
    detector: "legacy-bubbles",
    ...meta,
  });
};
