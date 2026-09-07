import { clampBoxToPage, resizeBox, ResizeHandle, sortedRegions } from "@/layout/edit";
import { FontSet } from "@/layout/fontEngine";
import { baseAreaFor, RegionPlan } from "@/layout/plan";
import { buildPreview, PreviewIssue } from "@/layout/preview";
import { maskToSvgPath } from "@/layout/svg";
import { Box, PageLayout, Region } from "@/layout/types";
import React, { useEffect, useMemo, useRef, useState } from "react";

export type DragTarget = "area" | "textBox";

interface Props {
  layout: PageLayout;
  imageUrl: string;
  fonts: FontSet;
  selectedId: string | null;
  dragTarget: DragTarget;
  showSourceBoxes: boolean;
  zoom: number;
  onSelect: (regionId: string | null) => void;
  onBoxLive: (regionId: string, box: Box, target: DragTarget) => void;
  onGestureStart: () => PageLayout;
  onGestureEnd: (snapshot: PageLayout) => void;
  onPreviewComputed?: (plans: RegionPlan[], issues: PreviewIssue[]) => void;
}

type Drag = {
  regionId: string;
  handle: ResizeHandle | "move";
  start: { x: number; y: number };
  startBox: Box;
  snapshot: PageLayout;
};

const HANDLES: ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

const cursorFor = (handle: ResizeHandle | "move") =>
  handle === "move"
    ? "move"
    : handle === "n" || handle === "s"
      ? "ns-resize"
      : handle === "e" || handle === "w"
        ? "ew-resize"
        : handle === "ne" || handle === "sw"
          ? "nesw-resize"
          : "nwse-resize";

const KIND_COLORS: Record<Region["kind"], string> = {
  speech: "#6CC4DC",
  thought: "#A7DBEA",
  caption: "#F2C14E",
  sfx: "#F28B6B",
  label: "#8FD19E",
};

/**
 * The page with a live typeset overlay and draggable region boxes. Everything
 * is drawn in the layout's pixel space inside one SVG, so coordinates map
 * one-to-one to what the server renders.
 */
const EditorCanvas: React.FC<Props> = ({
  layout,
  imageUrl,
  fonts,
  selectedId,
  dragTarget,
  showSourceBoxes,
  zoom,
  onSelect,
  onBoxLive,
  onGestureStart,
  onGestureEnd,
  onPreviewComputed,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [cache] = useState(() => new WeakMap<Region, RegionPlan>());
  const [scale, setScale] = useState(0.5);

  const preview = useMemo(() => buildPreview(layout, fonts, cache), [layout, fonts, cache]);
  useEffect(() => {
    onPreviewComputed?.(preview.plans, preview.issues);
  }, [preview, onPreviewComputed]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const update = () => setScale(svg.getBoundingClientRect().width / layout.width || 0.5);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(svg);
    return () => observer.disconnect();
  }, [layout.width]);

  const planById = useMemo(
    () => new Map(preview.plans.map((plan) => [plan.region.id, plan])),
    [preview],
  );

  const areaOf = (region: Region): Box =>
    region.textArea || planById.get(region.id)?.area || baseAreaFor(region, layout);

  const boxFor = (region: Region) =>
    dragTarget === "textBox" ? region.textBox : areaOf(region);

  const toPoint = (event: React.PointerEvent) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
    return { x: point.x, y: point.y };
  };

  const startDrag = (
    event: React.PointerEvent<SVGElement>,
    region: Region,
    handle: ResizeHandle | "move",
  ) => {
    event.stopPropagation();
    event.preventDefault();
    const start = toPoint(event);
    if (!start) return;
    onSelect(region.id);
    dragRef.current = {
      regionId: region.id,
      handle,
      start,
      startBox: boxFor(region),
      snapshot: onGestureStart(),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const point = toPoint(event);
    if (!point) return;
    const box = clampBoxToPage(
      resizeBox(drag.startBox, drag.handle, point.x - drag.start.x, point.y - drag.start.y),
      layout,
    );
    onBoxLive(drag.regionId, box, dragTarget);
  };

  const onPointerUp = () => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    onGestureEnd(drag.snapshot);
  };

  const strokeWidth = 1.5 / scale;
  const handleSize = 9 / scale;
  const regions = sortedRegions(layout);

  return (
    <div className="relative select-none" style={{ width: `${zoom * 100}%` }}>
      <img
        src={imageUrl}
        alt=""
        className="block w-full"
        draggable={false}
        style={{ aspectRatio: `${layout.width} / ${layout.height}` }}
      />
      <svg
        ref={svgRef}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerDown={() => onSelect(null)}
      >
        <g style={{ pointerEvents: "none" }} dangerouslySetInnerHTML={{ __html: preview.markup }} />

        {regions.map((region) => {
          const selected = region.id === selectedId;
          const color = KIND_COLORS[region.kind];
          const area = areaOf(region);
          const maskPath = maskToSvgPath(region.mask);
          const editBox = boxFor(region);
          return (
            <g key={region.id} opacity={region.hidden ? 0.35 : 1}>
              {selected && maskPath && (
                <path d={maskPath} fill="none" stroke="#63B983" strokeWidth={strokeWidth} strokeDasharray={`${4 / scale} ${3 / scale}`} style={{ pointerEvents: "none" }} />
              )}
              {(showSourceBoxes || selected) && (
                <rect
                  x={region.textBox.x}
                  y={region.textBox.y}
                  width={region.textBox.w}
                  height={region.textBox.h}
                  fill="none"
                  stroke="#E0655A"
                  strokeWidth={strokeWidth}
                  strokeDasharray={`${5 / scale} ${4 / scale}`}
                  style={{ pointerEvents: "none" }}
                />
              )}
              <rect
                x={area.x}
                y={area.y}
                width={area.w}
                height={area.h}
                fill={selected ? `${color}22` : "transparent"}
                stroke={color}
                strokeWidth={selected ? strokeWidth * 1.6 : strokeWidth}
                style={{ cursor: cursorFor("move") }}
                onPointerDown={(event) => startDrag(event, region, "move")}
              />
              {selected && dragTarget === "textBox" && (
                <rect
                  x={editBox.x}
                  y={editBox.y}
                  width={editBox.w}
                  height={editBox.h}
                  fill="#E0655A22"
                  stroke="#E0655A"
                  strokeWidth={strokeWidth * 1.6}
                  style={{ cursor: cursorFor("move") }}
                  onPointerDown={(event) => startDrag(event, region, "move")}
                />
              )}
              {selected &&
                HANDLES.map((handle) => {
                  const cx = handle.includes("w")
                    ? editBox.x
                    : handle.includes("e")
                      ? editBox.x + editBox.w
                      : editBox.x + editBox.w / 2;
                  const cy = handle.includes("n")
                    ? editBox.y
                    : handle.includes("s")
                      ? editBox.y + editBox.h
                      : editBox.y + editBox.h / 2;
                  return (
                    <rect
                      key={handle}
                      x={cx - handleSize / 2}
                      y={cy - handleSize / 2}
                      width={handleSize}
                      height={handleSize}
                      fill="#ffffff"
                      stroke={dragTarget === "textBox" ? "#E0655A" : color}
                      strokeWidth={strokeWidth}
                      style={{ cursor: cursorFor(handle) }}
                      onPointerDown={(event) => startDrag(event, region, handle)}
                    />
                  );
                })}
              <text
                x={area.x + 4 / scale}
                y={area.y - 5 / scale}
                fontSize={11 / scale}
                fontFamily="IBM Plex Mono, ui-monospace, monospace"
                fontWeight={500}
                fill={color}
                style={{ pointerEvents: "none" }}
              >
                {region.order + 1} · {region.kind}
                {region.locked ? " · locked" : ""}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

export default EditorCanvas;
