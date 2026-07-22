import { TextBubble } from "../types";

export type PixelSpan = {
  y: number;
  height: number;
  left: number;
  right: number;
};

export type RefinedBubbleRegion = {
  box: { left: number; top: number; width: number; height: number };
  spans: PixelSpan[];
  confidence: number;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const percentile = (values: number[], ratio: number) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.round((sorted.length - 1) * clamp(ratio, 0, 1))];
};

const isContainerType = (type: TextBubble["type"]) =>
  type === "speech" || type === "dialogue" || type === "caption";

export const getModelPixelBox = (
  bubble: TextBubble,
  canvasWidth: number,
  canvasHeight: number,
) => {
  const sourceBox = bubble.render_box_2d || bubble.box_2d;
  const [ymin, xmin, ymax, xmax] = sourceBox;
  const left = (xmin / 1000) * canvasWidth;
  const top = (ymin / 1000) * canvasHeight;
  return {
    left,
    top,
    width: Math.max(1, ((xmax - xmin) / 1000) * canvasWidth),
    height: Math.max(1, ((ymax - ymin) / 1000) * canvasHeight),
  };
};

export const normalizePixelBox = (
  box: RefinedBubbleRegion["box"],
  canvasWidth: number,
  canvasHeight: number,
): [number, number, number, number] => [
  Math.round(clamp((box.top / canvasHeight) * 1000, 0, 1000)),
  Math.round(clamp((box.left / canvasWidth) * 1000, 0, 1000)),
  Math.round(
    clamp(((box.top + box.height) / canvasHeight) * 1000, 0, 1000),
  ),
  Math.round(
    clamp(((box.left + box.width) / canvasWidth) * 1000, 0, 1000),
  ),
];

/**
 * Uses the model box as a seed and finds the connected, light-colored bubble
 * interior around it. The returned horizontal spans are also a cheap mask that
 * can cover source glyphs without painting over the bubble outline or artwork.
 */
export const refineBubbleRegion = (
  source: CanvasImageSource,
  bubble: TextBubble,
  canvasWidth: number,
  canvasHeight: number,
): RefinedBubbleRegion | null => {
  if (!isContainerType(bubble.type) || typeof document === "undefined") {
    return null;
  }

  const modelBox = getModelPixelBox(bubble, canvasWidth, canvasHeight);
  const expandX = Math.max(12, modelBox.width * 0.38);
  const expandY = Math.max(12, modelBox.height * 0.38);
  const searchLeft = Math.floor(clamp(modelBox.left - expandX, 0, canvasWidth));
  const searchTop = Math.floor(clamp(modelBox.top - expandY, 0, canvasHeight));
  const searchRight = Math.ceil(
    clamp(modelBox.left + modelBox.width + expandX, 0, canvasWidth),
  );
  const searchBottom = Math.ceil(
    clamp(modelBox.top + modelBox.height + expandY, 0, canvasHeight),
  );
  const searchWidth = searchRight - searchLeft;
  const searchHeight = searchBottom - searchTop;
  if (searchWidth < 8 || searchHeight < 8) return null;

  const analysisScale = Math.min(1, 260 / Math.max(searchWidth, searchHeight));
  const width = Math.max(8, Math.round(searchWidth * analysisScale));
  const height = Math.max(8, Math.round(searchHeight * analysisScale));
  const analysis = document.createElement("canvas");
  analysis.width = width;
  analysis.height = height;
  const analysisCtx = analysis.getContext("2d", { willReadFrequently: true });
  if (!analysisCtx) return null;

  analysisCtx.imageSmoothingEnabled = true;
  analysisCtx.drawImage(
    source,
    searchLeft,
    searchTop,
    searchWidth,
    searchHeight,
    0,
    0,
    width,
    height,
  );
  const pixels = analysisCtx.getImageData(0, 0, width, height).data;

  const relativeModel = {
    left: ((modelBox.left - searchLeft) / searchWidth) * width,
    top: ((modelBox.top - searchTop) / searchHeight) * height,
    width: (modelBox.width / searchWidth) * width,
    height: (modelBox.height / searchHeight) * height,
  };

  let seedIndex = -1;
  let seedScore = Number.NEGATIVE_INFINITY;
  const centerX = relativeModel.left + relativeModel.width / 2;
  const centerY = relativeModel.top + relativeModel.height / 2;
  const startX = Math.floor(clamp(relativeModel.left, 0, width - 1));
  const endX = Math.ceil(
    clamp(relativeModel.left + relativeModel.width, 0, width - 1),
  );
  const startY = Math.floor(clamp(relativeModel.top, 0, height - 1));
  const endY = Math.ceil(
    clamp(relativeModel.top + relativeModel.height, 0, height - 1),
  );

  for (let y = startY; y <= endY; y += 1) {
    for (let x = startX; x <= endX; x += 1) {
      const offset = (y * width + x) * 4;
      const r = pixels[offset];
      const g = pixels[offset + 1];
      const b = pixels[offset + 2];
      const luma = r * 0.299 + g * 0.587 + b * 0.114;
      const saturation = Math.max(r, g, b) - Math.min(r, g, b);
      const distance =
        Math.hypot(x - centerX, y - centerY) /
        Math.max(1, Math.hypot(relativeModel.width, relativeModel.height));
      const score = luma - saturation * 0.22 - distance * 18;
      if (score > seedScore) {
        seedScore = score;
        seedIndex = y * width + x;
      }
    }
  }

  if (seedIndex < 0) return null;
  const seedOffset = seedIndex * 4;
  const seedR = pixels[seedOffset];
  const seedG = pixels[seedOffset + 1];
  const seedB = pixels[seedOffset + 2];
  const seedLuma = seedR * 0.299 + seedG * 0.587 + seedB * 0.114;
  if (seedLuma < 155) return null;

  const threshold = Math.max(138, seedLuma - 52);
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  const component = new Uint8Array(width * height);
  let head = 0;
  let tail = 0;
  queue[tail++] = seedIndex;
  visited[seedIndex] = 1;
  let pixelCount = 0;
  let edgeFlags = 0;

  const canVisit = (index: number) => {
    const offset = index * 4;
    const r = pixels[offset];
    const g = pixels[offset + 1];
    const b = pixels[offset + 2];
    const luma = r * 0.299 + g * 0.587 + b * 0.114;
    const colorDistance = Math.sqrt(
      (r - seedR) ** 2 + (g - seedG) ** 2 + (b - seedB) ** 2,
    );
    return luma >= threshold && colorDistance <= 105;
  };

  while (head < tail) {
    const index = queue[head++];
    if (!canVisit(index)) continue;
    component[index] = 1;
    pixelCount += 1;
    const x = index % width;
    const y = Math.floor(index / width);
    if (x === 0) edgeFlags |= 1;
    if (x === width - 1) edgeFlags |= 2;
    if (y === 0) edgeFlags |= 4;
    if (y === height - 1) edgeFlags |= 8;

    const neighbors = [
      x > 0 ? index - 1 : -1,
      x < width - 1 ? index + 1 : -1,
      y > 0 ? index - width : -1,
      y < height - 1 ? index + width : -1,
    ];
    for (const neighbor of neighbors) {
      if (neighbor >= 0 && visited[neighbor] === 0) {
        visited[neighbor] = 1;
        queue[tail++] = neighbor;
      }
    }
  }

  const areaRatio = pixelCount / (width * height);
  const touchedEdges = [1, 2, 4, 8].filter((flag) => edgeFlags & flag).length;
  const modelArea = Math.max(1, relativeModel.width * relativeModel.height);
  if (
    pixelCount < modelArea * 0.28 ||
    areaRatio > 0.86 ||
    touchedEdges >= 3
  ) {
    return null;
  }

  const rawRows: { y: number; left: number; right: number }[] = [];
  let maxRowWidth = 0;
  for (let y = 0; y < height; y += 1) {
    let left = width;
    let right = -1;
    for (let x = 0; x < width; x += 1) {
      if (component[y * width + x] === 1) {
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
    }
    if (right >= left) {
      rawRows.push({ y, left, right });
      maxRowWidth = Math.max(maxRowWidth, right - left + 1);
    }
  }
  if (rawRows.length < 3 || maxRowWidth < 3) return null;

  const bodyRows = rawRows.filter(
    (row) => row.right - row.left + 1 >= maxRowWidth * 0.55,
  );
  if (bodyRows.length < 3) return null;

  const scaleX = searchWidth / width;
  const scaleY = searchHeight / height;
  const componentLeft =
    searchLeft + percentile(bodyRows.map((row) => row.left), 0.68) * scaleX;
  const componentRight =
    searchLeft +
    (percentile(bodyRows.map((row) => row.right), 0.32) + 1) * scaleX;
  const componentTop = searchTop + bodyRows[0].y * scaleY;
  const componentBottom =
    searchTop + (bodyRows[bodyRows.length - 1].y + 1) * scaleY;

  if (componentRight <= componentLeft || componentBottom <= componentTop) {
    return null;
  }

  const blend = 0.68;
  const left = componentLeft * blend + modelBox.left * (1 - blend);
  const top = componentTop * blend + modelBox.top * (1 - blend);
  const right =
    componentRight * blend + (modelBox.left + modelBox.width) * (1 - blend);
  const bottom =
    componentBottom * blend + (modelBox.top + modelBox.height) * (1 - blend);
  const paddingX = Math.max(1, (right - left) * 0.035);
  const paddingY = Math.max(1, (bottom - top) * 0.035);

  const spans = rawRows.map((row) => ({
    y: searchTop + row.y * scaleY,
    height: Math.ceil(scaleY + 0.5),
    left: searchLeft + row.left * scaleX,
    right: searchLeft + (row.right + 1) * scaleX,
  }));

  return {
    box: {
      left: clamp(left + paddingX, 0, canvasWidth - 1),
      top: clamp(top + paddingY, 0, canvasHeight - 1),
      width: Math.max(1, right - left - paddingX * 2),
      height: Math.max(1, bottom - top - paddingY * 2),
    },
    spans,
    confidence: clamp(
      0.45 + Math.min(0.35, pixelCount / modelArea / 8) - touchedEdges * 0.06,
      0,
      1,
    ),
  };
};

