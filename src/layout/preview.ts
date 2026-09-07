import { FontSet } from "./fontEngine";
import { planRegion, RegionPlan, ResolvedRegionFacts } from "./plan";
import { buildOverlayMarkup } from "./svg";
import { PageLayout, Region } from "./types";

/**
 * Browser-side preview of a layout. It reuses the server's planning and SVG
 * code; the only server-only facts (fill colour, surface luminance) come from
 * the `render` info cached on each region by the last server render.
 */

const hexLuma = (hex: string) => {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const value = Number.parseInt(full.slice(0, 6), 16);
  if (!Number.isFinite(value)) return 255;
  return ((value >> 16) & 255) * 0.299 + ((value >> 8) & 255) * 0.587 + (value & 255) * 0.114;
};

export const factsFromRender = (region: Region): ResolvedRegionFacts => {
  const info = region.render;
  if (!info) return {};
  const fillColor = info.fillColor;
  return {
    fillColor,
    surfaceLuma: fillColor ? hexLuma(fillColor) : undefined,
    maskConfidence: info.maskConfidence,
    maskDiagnostics: info.maskDiagnostics,
  };
};

export interface PreviewIssue {
  regionId: string;
  message: string;
}

export interface PreviewResult {
  plans: RegionPlan[];
  markup: string;
  issues: PreviewIssue[];
}

/** Plans are cached by region identity so dragging one region replans only it. */
export const buildPreview = (
  layout: PageLayout,
  fonts: FontSet,
  cache?: WeakMap<Region, RegionPlan>,
): PreviewResult => {
  const plans: RegionPlan[] = [];
  const issues: PreviewIssue[] = [];
  for (const region of layout.regions) {
    if (region.hidden || !region.translatedText.trim()) continue;
    let plan = cache?.get(region);
    if (!plan) {
      try {
        plan = planRegion(region, layout, fonts, factsFromRender(region));
        cache?.set(region, plan);
      } catch (error) {
        issues.push({
          regionId: region.id,
          message: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
    }
    plans.push(plan);
    if (plan.info.overflow) {
      issues.push({ regionId: region.id, message: "Text does not fit the area" });
    }
    if (region.mask.type === "auto" && region.placement === "inside" && region.fill.mode !== "none") {
      issues.push({
        regionId: region.id,
        message: "Cleaning mask will be computed in the server preview",
      });
    }
  }
  return {
    plans,
    markup: buildOverlayMarkup({ plans, includeFills: true }),
    issues,
  };
};
