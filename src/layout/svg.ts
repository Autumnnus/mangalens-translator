import { textToPathData } from "./fontEngine";
import { Badge, RegionPlan } from "./plan";
import { Box, Mask } from "./types";

/**
 * Builds the text overlay as an SVG document. Every glyph is an outline path,
 * so the document renders identically in librsvg (server) and browsers.
 */

const fmt = (value: number) => Math.round(value * 100) / 100;

const escapeAttr = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

const roundedRectPath = (box: Box, radiusRatio: number) => {
  const r = Math.min(box.w, box.h) * Math.min(0.5, Math.max(0, radiusRatio));
  const { x, y, w, h } = box;
  if (r <= 0) return `M${fmt(x)} ${fmt(y)}h${fmt(w)}v${fmt(h)}h${fmt(-w)}z`;
  return [
    `M${fmt(x + r)} ${fmt(y)}`,
    `h${fmt(w - 2 * r)}`,
    `a${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(r)} ${fmt(r)}`,
    `v${fmt(h - 2 * r)}`,
    `a${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(-r)} ${fmt(r)}`,
    `h${fmt(-(w - 2 * r))}`,
    `a${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(-r)} ${fmt(-r)}`,
    `v${fmt(-(h - 2 * r))}`,
    `a${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(r)} ${fmt(-r)}`,
    "z",
  ].join("");
};

export const maskToSvgPath = (mask: Mask): string | null => {
  switch (mask.type) {
    case "rect":
      return roundedRectPath(mask.box, mask.radius ?? 0);
    case "ellipse": {
      const { x, y, w, h } = mask.box;
      const rx = w / 2;
      const ry = h / 2;
      const cx = x + rx;
      const cy = y + ry;
      return `M${fmt(cx - rx)} ${fmt(cy)}a${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(2 * rx)} 0a${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(-2 * rx)} 0z`;
    }
    case "polygon":
      return (
        mask.points
          .map(([px, py], index) => `${index ? "L" : "M"}${fmt(px)} ${fmt(py)}`)
          .join("") + "z"
      );
    default:
      return null;
  }
};

const badgeMarkup = (badge: Badge) =>
  `<path d="${roundedRectPath(badge.box, badge.radius)}" fill="${badge.color}" fill-opacity="${fmt(badge.opacity)}"/>`;

const regionMarkup = (plan: RegionPlan) => {
  const { region, typeset, font, textColor, strokeColor, strokeWidth } = plan;
  if (!typeset || typeset.lines.length === 0) return "";
  const paths = typeset.lines
    .map((line) =>
      textToPathData(
        font,
        line.text,
        line.x,
        line.baseline,
        typeset.fontSize,
        region.style.letterSpacing,
      ),
    )
    .filter(Boolean);
  if (paths.length === 0) return "";
  const d = paths.join(" ");
  const parts: string[] = [];
  if (plan.badge) parts.push(badgeMarkup(plan.badge));
  if (strokeColor !== "none" && strokeWidth > 0) {
    parts.push(
      `<path d="${d}" fill="${strokeColor}" stroke="${strokeColor}" stroke-width="${fmt(strokeWidth * 2)}" stroke-linejoin="round" stroke-linecap="round"/>`,
    );
  }
  parts.push(`<path d="${d}" fill="${textColor}"/>`);
  const body = parts.join("");
  if (region.style.rotation) {
    const cx = plan.area.x + plan.area.w / 2;
    const cy = plan.area.y + plan.area.h / 2;
    return `<g data-region="${escapeAttr(region.id)}" transform="rotate(${fmt(region.style.rotation)} ${fmt(cx)} ${fmt(cy)})">${body}</g>`;
  }
  return `<g data-region="${escapeAttr(region.id)}">${body}</g>`;
};

export interface OverlaySvgOptions {
  width: number;
  height: number;
  plans: RegionPlan[];
  /**
   * Paint the cleaning masks in the SVG too. The server fills masks directly
   * in the pixel buffer and leaves this off; the browser preview turns it on.
   */
  includeFills?: boolean;
}

/** Inner markup only, for embedding inside an existing <svg> element. */
export const buildOverlayMarkup = ({
  plans,
  includeFills = false,
}: Pick<OverlaySvgOptions, "plans" | "includeFills">) => {
  const fills = includeFills
    ? plans
        .filter(
          (plan) =>
            plan.region.placement === "inside" &&
            plan.region.fill.mode !== "none" &&
            plan.info.fillColor,
        )
        .map((plan) => {
          const d = maskToSvgPath(plan.region.mask);
          return d
            ? `<path data-mask="${escapeAttr(plan.region.id)}" d="${d}" fill="${plan.info.fillColor}"/>`
            : "";
        })
        .join("")
    : "";
  const text = plans.map(regionMarkup).join("");
  return `${fills}${text}`;
};

export const buildOverlaySvg = ({
  width,
  height,
  plans,
  includeFills = false,
}: OverlaySvgOptions) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${buildOverlayMarkup({ plans, includeFills })}</svg>`;
