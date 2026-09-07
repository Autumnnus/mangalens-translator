import { createRegion, newRegionId } from "./defaults";
import { Box, Mask, PageLayout, Region, RegionKind } from "./types";

/** Pure layout editing helpers shared by the editor UI. */

const touch = (layout: PageLayout): PageLayout => ({
  ...layout,
  meta: { ...layout.meta, updatedAt: new Date().toISOString() },
});

export const replaceRegion = (
  layout: PageLayout,
  regionId: string,
  update: (region: Region) => Region,
): PageLayout =>
  touch({
    ...layout,
    regions: layout.regions.map((region) =>
      region.id === regionId ? update(region) : region,
    ),
  });

export const patchRegion = (
  layout: PageLayout,
  regionId: string,
  patch: Partial<Region>,
): PageLayout => replaceRegion(layout, regionId, (region) => ({ ...region, ...patch }));

export const patchRegionStyle = (
  layout: PageLayout,
  regionId: string,
  patch: Partial<Region["style"]>,
): PageLayout =>
  replaceRegion(layout, regionId, (region) => ({
    ...region,
    style: { ...region.style, ...patch },
  }));

/** Moving the source text box invalidates an automatically found mask. */
export const setRegionTextBox = (
  layout: PageLayout,
  regionId: string,
  textBox: Box,
): PageLayout =>
  replaceRegion(layout, regionId, (region) => ({
    ...region,
    textBox,
    mask: region.maskSource === "manual" ? region.mask : { type: "auto" },
    maskSource: region.maskSource === "manual" ? "manual" : "auto",
    render: undefined,
  }));

/** A manual rect/ellipse mask follows the text area when it is dragged. */
export const setRegionTextArea = (
  layout: PageLayout,
  regionId: string,
  textArea: Box,
): PageLayout =>
  replaceRegion(layout, regionId, (region) => {
    const followsArea =
      region.maskSource === "manual" &&
      (region.mask.type === "rect" || region.mask.type === "ellipse");
    const mask: Mask = followsArea
      ? { ...(region.mask as Extract<Mask, { type: "rect" | "ellipse" }>), box: textArea }
      : region.mask;
    return { ...region, textArea, mask };
  });

export const setRegionMaskType = (
  layout: PageLayout,
  regionId: string,
  type: "auto" | "none" | "rect" | "ellipse",
  area: Box,
): PageLayout =>
  replaceRegion(layout, regionId, (region) => {
    if (type === "auto") {
      return { ...region, mask: { type: "auto" }, maskSource: "auto", render: undefined };
    }
    if (type === "none") {
      return { ...region, mask: { type: "none" }, maskSource: "manual" };
    }
    const box = region.textArea || area;
    return {
      ...region,
      textArea: box,
      mask: type === "rect" ? { type: "rect", box, radius: 0.3 } : { type: "ellipse", box },
      maskSource: "manual",
    };
  });

export const addRegion = (
  layout: PageLayout,
  kind: RegionKind,
  box: Box,
): { layout: PageLayout; region: Region } => {
  const order = layout.regions.reduce((max, region) => Math.max(max, region.order), -1) + 1;
  const region = createRegion({
    id: newRegionId("m"),
    kind,
    order,
    textBox: box,
    sourceText: "",
    translatedText: "",
    source: "manual",
  });
  region.textArea = box;
  region.mask = kind === "sfx" ? { type: "none" } : { type: "auto" };
  return { layout: touch({ ...layout, regions: [...layout.regions, region] }), region };
};

export const removeRegion = (layout: PageLayout, regionId: string): PageLayout =>
  touch({ ...layout, regions: layout.regions.filter((region) => region.id !== regionId) });

export const moveRegionOrder = (
  layout: PageLayout,
  regionId: string,
  direction: -1 | 1,
): PageLayout => {
  const sorted = [...layout.regions].sort((a, b) => a.order - b.order);
  const index = sorted.findIndex((region) => region.id === regionId);
  const target = index + direction;
  if (index === -1 || target < 0 || target >= sorted.length) return layout;
  [sorted[index], sorted[target]] = [sorted[target], sorted[index]];
  return touch({
    ...layout,
    regions: sorted.map((region, order) => ({ ...region, order })),
  });
};

export const sortedRegions = (layout: PageLayout) =>
  [...layout.regions].sort((a, b) => a.order - b.order);

export const clampBoxToPage = (box: Box, layout: PageLayout, minSize = 8): Box => {
  const w = Math.max(minSize, Math.min(box.w, layout.width));
  const h = Math.max(minSize, Math.min(box.h, layout.height));
  return {
    x: Math.min(Math.max(0, box.x), layout.width - w),
    y: Math.min(Math.max(0, box.y), layout.height - h),
    w,
    h,
  };
};

export type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export const resizeBox = (
  start: Box,
  handle: ResizeHandle | "move",
  dx: number,
  dy: number,
  minSize = 8,
): Box => {
  if (handle === "move") return { ...start, x: start.x + dx, y: start.y + dy };
  let { x, y, w, h } = start;
  if (handle.includes("e")) w = Math.max(minSize, start.w + dx);
  if (handle.includes("s")) h = Math.max(minSize, start.h + dy);
  if (handle.includes("w")) {
    const next = Math.max(minSize, start.w - dx);
    x = start.x + (start.w - next);
    w = next;
  }
  if (handle.includes("n")) {
    const next = Math.max(minSize, start.h - dy);
    y = start.y + (start.h - next);
    h = next;
  }
  return { x, y, w, h };
};
