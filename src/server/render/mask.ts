import { Box, Point } from "@/layout/types";

/**
 * Pixel-level bubble analysis on a raw RGB(A) buffer. This is the server-side
 * successor of the browser flood fill: it finds the connected, uniformly
 * coloured interior around a detected text box so the source glyphs can be
 * painted out without touching the outline or surrounding artwork.
 */

export interface RawImage {
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
  channels: number;
}

export interface InteriorResult {
  polygon: Point[];
  fillColor: string;
  /** 0-255 luminance of the fill colour. */
  luma: number;
  confidence: number;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const luminance = (r: number, g: number, b: number) =>
  r * 0.299 + g * 0.587 + b * 0.114;

const toHex = (r: number, g: number, b: number) =>
  `#${[r, g, b]
    .map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0"))
    .join("")}`;

export const hexToRgb = (hex: string): [number, number, number] => {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean.slice(0, 6);
  const value = Number.parseInt(full, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};

const median = (values: number[]) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

/** Median colour of the pixels in `box`, ignoring outliers by channel. */
export const sampleBoxColor = (image: RawImage, box: Box) => {
  const x0 = clamp(Math.floor(box.x), 0, image.width - 1);
  const y0 = clamp(Math.floor(box.y), 0, image.height - 1);
  const x1 = clamp(Math.ceil(box.x + box.w), x0 + 1, image.width);
  const y1 = clamp(Math.ceil(box.y + box.h), y0 + 1, image.height);
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const stepX = Math.max(1, Math.floor((x1 - x0) / 64));
  const stepY = Math.max(1, Math.floor((y1 - y0) / 64));
  for (let y = y0; y < y1; y += stepY) {
    for (let x = x0; x < x1; x += stepX) {
      const offset = (y * image.width + x) * image.channels;
      rs.push(image.data[offset]);
      gs.push(image.data[offset + 1]);
      bs.push(image.data[offset + 2]);
    }
  }
  const r = median(rs);
  const g = median(gs);
  const b = median(bs);
  return { color: toHex(r, g, b), luma: luminance(r, g, b), rgb: [r, g, b] as const };
};

/**
 * Median colour of the ring just outside `box`. For a text box inside a
 * bubble this is the bubble's background.
 */
export const sampleRingColor = (image: RawImage, box: Box, ratio = 0.18) => {
  const dx = Math.max(3, box.w * ratio);
  const dy = Math.max(3, box.h * ratio);
  const outer = {
    x: clamp(box.x - dx, 0, image.width),
    y: clamp(box.y - dy, 0, image.height),
    w: 0,
    h: 0,
  };
  outer.w = clamp(box.x + box.w + dx, 0, image.width) - outer.x;
  outer.h = clamp(box.y + box.h + dy, 0, image.height) - outer.y;
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const x0 = Math.floor(outer.x);
  const y0 = Math.floor(outer.y);
  const x1 = Math.ceil(outer.x + outer.w);
  const y1 = Math.ceil(outer.y + outer.h);
  const ix0 = Math.floor(box.x);
  const iy0 = Math.floor(box.y);
  const ix1 = Math.ceil(box.x + box.w);
  const iy1 = Math.ceil(box.y + box.h);
  const step = Math.max(1, Math.floor(Math.max(outer.w, outer.h) / 160));
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      if (x >= ix0 && x < ix1 && y >= iy0 && y < iy1) continue;
      if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue;
      const offset = (y * image.width + x) * image.channels;
      rs.push(image.data[offset]);
      gs.push(image.data[offset + 1]);
      bs.push(image.data[offset + 2]);
    }
  }
  if (rs.length === 0) return sampleBoxColor(image, box);
  const r = median(rs);
  const g = median(gs);
  const b = median(bs);
  return { color: toHex(r, g, b), luma: luminance(r, g, b), rgb: [r, g, b] as const };
};

/** Ramer–Douglas–Peucker simplification. */
const simplifyPolyline = (points: Point[], epsilon: number): Point[] => {
  if (points.length < 3) return points;
  const [sx, sy] = points[0];
  const [ex, ey] = points[points.length - 1];
  let maxDistance = 0;
  let index = 0;
  const length = Math.hypot(ex - sx, ey - sy) || 1;
  for (let i = 1; i < points.length - 1; i += 1) {
    const [px, py] = points[i];
    const distance =
      Math.abs((ey - sy) * px - (ex - sx) * py + ex * sy - ey * sx) / length;
    if (distance > maxDistance) {
      maxDistance = distance;
      index = i;
    }
  }
  if (maxDistance <= epsilon) return [points[0], points[points.length - 1]];
  const left = simplifyPolyline(points.slice(0, index + 1), epsilon);
  const right = simplifyPolyline(points.slice(index), epsilon);
  return [...left.slice(0, -1), ...right];
};

export interface InteriorOptions {
  /**
   * Search margins around the text box, as fractions of its size. The
   * search widens through this list while the interior still touches the
   * window edge; a real bubble stops touching, a leak never does.
   */
  expandSteps?: number[];
  /** Longest side of the analysis raster. */
  analysisSize?: number;
  /**
   * Erosion radius in analysis pixels. Thin gaps in the outline (dashed
   * thought bubbles, hatching that meets the bubble) are narrower than this,
   * so the flood cannot escape through them.
   */
  erode?: number;
  /** Detector's balloon bounds; the search starts by covering this box. */
  hint?: Box;
  /** Receives one line per rejected attempt; useful in previews and tests. */
  diagnostics?: string[];
}

/**
 * Finds the bubble interior that encloses `textBox`. Returns null when the
 * surrounding area does not look like a closed, uniformly coloured container
 * (screentone, open panels, artwork), in which case the caller should fall
 * back to a geometric mask.
 */
export const detectBubbleInterior = (
  image: RawImage,
  textBox: Box,
  options: InteriorOptions = {},
): InteriorResult | null => {
  const steps = options.expandSteps ?? [0.45, 0.95, 1.7];
  let last: InteriorResult | null = null;
  for (const expand of steps) {
    const attempt = detectInteriorOnce(image, textBox, expand, options);
    if (!attempt) return last;
    if (attempt.result) {
      last = attempt.result;
      if (attempt.touchedEdges === 0) return attempt.result;
      options.diagnostics?.push(
        `expand=${expand}: interior touches ${attempt.touchedEdges} window edge(s)`,
      );
    } else if (!attempt.retryLarger) {
      return last;
    }
  }
  // Still touching the window after the widest search: treat as a leak
  // unless only one edge is involved (a bubble cut by the panel border).
  return last && last.confidence >= 0.4 ? last : null;
};

type InteriorAttempt =
  | { result: InteriorResult; touchedEdges: number; retryLarger?: false }
  | { result: null; touchedEdges: number; retryLarger: boolean };

const detectInteriorOnce = (
  image: RawImage,
  textBox: Box,
  expand: number,
  options: InteriorOptions,
): InteriorAttempt | null => {
  const analysisSize = options.analysisSize ?? 320;
  const erode = Math.max(0, Math.round(options.erode ?? 2));
  // The window grows from the text box; a balloon hint widens the start so
  // small labels inside large boxes are not clipped by the first steps.
  const seed = options.hint
    ? {
        x: Math.min(textBox.x, options.hint.x),
        y: Math.min(textBox.y, options.hint.y),
        w:
          Math.max(textBox.x + textBox.w, options.hint.x + options.hint.w) -
          Math.min(textBox.x, options.hint.x),
        h:
          Math.max(textBox.y + textBox.h, options.hint.y + options.hint.h) -
          Math.min(textBox.y, options.hint.y),
      }
    : textBox;
  const expandX = Math.max(14, seed.w * expand);
  const expandY = Math.max(14, seed.h * expand);
  const searchLeft = Math.floor(clamp(seed.x - expandX, 0, image.width));
  const searchTop = Math.floor(clamp(seed.y - expandY, 0, image.height));
  const searchRight = Math.ceil(
    clamp(seed.x + seed.w + expandX, 0, image.width),
  );
  const searchBottom = Math.ceil(
    clamp(seed.y + seed.h + expandY, 0, image.height),
  );
  const searchWidth = searchRight - searchLeft;
  const searchHeight = searchBottom - searchTop;
  const reject = (reason: string, retryLarger = false): InteriorAttempt => {
    options.diagnostics?.push(`expand=${expand}: ${reason}`);
    return { result: null, touchedEdges: 0, retryLarger };
  };
  if (searchWidth < 8 || searchHeight < 8) return reject("window too small");

  const scale = Math.min(1, analysisSize / Math.max(searchWidth, searchHeight));
  const width = Math.max(8, Math.round(searchWidth * scale));
  const height = Math.max(8, Math.round(searchHeight * scale));
  const scaleX = searchWidth / width;
  const scaleY = searchHeight / height;

  // Box-filter downsample into a compact RGB raster.
  const pixels = new Uint8ClampedArray(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    const sy0 = searchTop + Math.floor(y * scaleY);
    const sy1 = Math.min(searchBottom, searchTop + Math.floor((y + 1) * scaleY));
    for (let x = 0; x < width; x += 1) {
      const sx0 = searchLeft + Math.floor(x * scaleX);
      const sx1 = Math.min(searchRight, searchLeft + Math.floor((x + 1) * scaleX));
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      for (let sy = sy0; sy < Math.max(sy0 + 1, sy1); sy += 1) {
        for (let sx = sx0; sx < Math.max(sx0 + 1, sx1); sx += 1) {
          const offset = (sy * image.width + sx) * image.channels;
          r += image.data[offset];
          g += image.data[offset + 1];
          b += image.data[offset + 2];
          count += 1;
        }
      }
      const target = (y * width + x) * 3;
      pixels[target] = r / count;
      pixels[target + 1] = g / count;
      pixels[target + 2] = b / count;
    }
  }

  const relative = {
    x: (textBox.x - searchLeft) / scaleX,
    y: (textBox.y - searchTop) / scaleY,
    w: textBox.w / scaleX,
    h: textBox.h / scaleY,
  };

  // The background colour is sampled from a thin ring around the text box:
  // inside the bubble but outside the glyphs.
  const ring = sampleRingColor(
    { data: pixels, width, height, channels: 3 },
    relative,
    0.14,
  );
  const [seedR, seedG, seedB] = ring.rgb;
  const seedLuma = ring.luma;
  const dark = seedLuma < 110;
  if (!dark && seedLuma < 120) {
    return reject(`ring luma ${seedLuma.toFixed(0)} is mid-grey (tone?)`);
  }

  const colorDistance = (offset: number) =>
    Math.sqrt(
      (pixels[offset] - seedR) ** 2 +
        (pixels[offset + 1] - seedG) ** 2 +
        (pixels[offset + 2] - seedB) ** 2,
    );
  const isBackground = (index: number) => {
    const offset = index * 3;
    const luma = luminance(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
    // Dark balloons sit next to dark artwork far more often than paper sits
    // next to near-white, so the dark tolerance is much tighter.
    if (dark) return luma <= seedLuma + 28 && colorDistance(offset) <= 48;
    return luma >= Math.max(128, seedLuma - 58) && colorDistance(offset) <= 105;
  };

  const light = new Uint8Array(width * height);
  for (let index = 0; index < light.length; index += 1) {
    light[index] = isBackground(index) ? 1 : 0;
  }
  // Erosion: a pixel survives only if its whole neighbourhood is background.
  const eroded = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!light[index]) continue;
      let keep = 1;
      for (let dy = -erode; dy <= erode && keep; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -erode; dx <= erode; dx += 1) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          if (!light[ny * width + nx]) {
            keep = 0;
            break;
          }
        }
      }
      eroded[index] = keep;
    }
  }

  // Candidate seeds: a grid inside the text box (gaps between glyph lines)
  // plus the ring around it. Each candidate's component is scored on how well
  // it encloses the text box, so a box that drifts onto the outline cannot
  // seed the page background by accident.
  const candidates: number[] = [];
  const pushCandidate = (x: number, y: number) => {
    const cx = clamp(Math.round(x), 0, width - 1);
    const cy = clamp(Math.round(y), 0, height - 1);
    const index = cy * width + cx;
    if (eroded[index] && !candidates.includes(index)) candidates.push(index);
  };
  const margin = erode + 2;
  for (let gy = 0; gy <= 4; gy += 1) {
    for (let gx = 0; gx <= 6; gx += 1) {
      pushCandidate(
        relative.x + (relative.w * gx) / 6,
        relative.y + (relative.h * gy) / 4,
      );
    }
  }
  for (let t = 0; t <= 8; t += 1) {
    const fx = relative.x + (relative.w * t) / 8;
    const fy = relative.y + (relative.h * t) / 8;
    pushCandidate(fx, relative.y - margin);
    pushCandidate(fx, relative.y + relative.h + margin);
    pushCandidate(relative.x - margin, fy);
    pushCandidate(relative.x + relative.w + margin, fy);
  }
  if (candidates.length === 0) {
    return reject("no background pixel in or around the text box");
  }

  const labels = new Int32Array(width * height); // 0 = unlabelled
  const queue = new Int32Array(width * height);
  const textArea = Math.max(1, relative.w * relative.h);

  type Evaluation = {
    dilated: Uint8Array;
    dilatedCount: number;
    rows: { y: number; left: number; right: number }[];
    touchedEdges: number;
    compactness: number;
    coverage: number;
    score: number;
    reason?: string;
  };

  const evaluate = (seedIndex: number, label: number): Evaluation | null => {
    let head = 0;
    let tail = 0;
    queue[tail++] = seedIndex;
    labels[seedIndex] = label;
    let pixelCount = 0;
    while (head < tail) {
      const index = queue[head++];
      pixelCount += 1;
      const x = index % width;
      const y = (index - x) / width;
      const neighbours = [
        x > 0 ? index - 1 : -1,
        x < width - 1 ? index + 1 : -1,
        y > 0 ? index - width : -1,
        y < height - 1 ? index + width : -1,
      ];
      for (const next of neighbours) {
        if (next >= 0 && eroded[next] && labels[next] === 0) {
          labels[next] = label;
          queue[tail++] = next;
        }
      }
    }
    if (pixelCount < textArea * 0.25) return null;

    // Dilate back within the background mask so the hull reaches the outline.
    const dilated = new Uint8Array(width * height);
    let edgeFlags = 0;
    let dilatedCount = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        if (!light[index]) continue;
        let near = labels[index] === label ? 1 : 0;
        for (let dy = -erode; dy <= erode && !near; dy += 1) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -erode; dx <= erode; dx += 1) {
            const nx = x + dx;
            if (nx < 0 || nx >= width) continue;
            if (labels[ny * width + nx] === label) {
              near = 1;
              break;
            }
          }
        }
        if (!near) continue;
        dilated[index] = 1;
        dilatedCount += 1;
        if (x === 0) edgeFlags |= 1;
        if (x === width - 1) edgeFlags |= 2;
        if (y === 0) edgeFlags |= 4;
        if (y === height - 1) edgeFlags |= 8;
      }
    }
    const touchedEdges = [1, 2, 4, 8].filter((flag) => edgeFlags & flag).length;

    const rows: { y: number; left: number; right: number }[] = [];
    let hullArea = 0;
    for (let y = 0; y < height; y += 1) {
      let left = width;
      let right = -1;
      const rowOffset = y * width;
      for (let x = 0; x < width; x += 1) {
        if (dilated[rowOffset + x]) {
          if (x < left) left = x;
          if (x > right) right = x;
        }
      }
      if (right >= left) {
        rows.push({ y, left, right });
        hullArea += right - left + 1;
      }
    }
    const compactness = dilatedCount / Math.max(1, hullArea);
    const coverRows = rows.filter(
      (row) => row.y >= relative.y && row.y <= relative.y + relative.h,
    );
    const covered = coverRows.filter(
      (row) =>
        row.left <= relative.x + relative.w * 0.08 &&
        row.right >= relative.x + relative.w * 0.92,
    ).length;
    const coverage = coverRows.length ? covered / coverRows.length : 0;

    let reason: string | undefined;
    if (dilatedCount / (width * height) > 0.9) reason = "fills the whole window";
    else if (touchedEdges >= 3) reason = `touches ${touchedEdges} window edges`;
    else if (rows.length < 3) reason = "degenerate";
    else if (compactness < 0.72) reason = `not compact (${compactness.toFixed(2)})`;
    else if (coverage < 0.7) reason = `covers only ${(coverage * 100).toFixed(0)}% of the text box rows`;
    else if (options.hint) {
      const interiorArea = dilatedCount * scaleX * scaleY;
      const hintArea = Math.max(1, options.hint.w * options.hint.h);
      if (interiorArea > hintArea * 2.6) {
        reason = `far larger than the balloon hint (${Math.round(interiorArea)}px vs ${Math.round(hintArea)}px)`;
      }
    }
    const score = coverage * 2 + compactness - touchedEdges * 0.4;
    return { dilated, dilatedCount, rows, touchedEdges, compactness, coverage, score, reason };
  };

  let best: Evaluation | null = null;
  let bestRejected: Evaluation | null = null;
  let label = 0;
  for (const seedIndex of candidates) {
    if (labels[seedIndex] !== 0) continue;
    label += 1;
    const evaluation = evaluate(seedIndex, label);
    if (!evaluation) continue;
    if (evaluation.reason) {
      if (!bestRejected || evaluation.score > bestRejected.score) bestRejected = evaluation;
      continue;
    }
    if (!best || evaluation.score > best.score) best = evaluation;
  }
  if (!best) {
    // Touching the window or filling it means the balloon is larger than
    // the search area: the caller should widen it before giving up.
    const reason = bestRejected?.reason || "no enclosing interior found";
    return reject(reason, /touches|fills/.test(reason));
  }
  const { dilated, dilatedCount, rows, touchedEdges, compactness, coverage } = best;

  // Fill colour from the interior itself.
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const sampleStep = Math.max(1, Math.floor(dilatedCount / 4000));
  let seen = 0;
  for (let index = 0; index < dilated.length; index += 1) {
    if (!dilated[index]) continue;
    seen += 1;
    if (seen % sampleStep) continue;
    rs.push(pixels[index * 3]);
    gs.push(pixels[index * 3 + 1]);
    bs.push(pixels[index * 3 + 2]);
  }
  const fr = median(rs);
  const fg = median(gs);
  const fb = median(bs);

  // Trace the hull as a polygon and simplify it in analysis space.
  const leftEdge: Point[] = rows.map((row) => [row.left, row.y]);
  const rightEdge: Point[] = rows.map((row) => [row.right + 1, row.y + 1]);
  const epsilon = 0.9;
  const leftSimplified = simplifyPolyline(leftEdge, epsilon);
  const rightSimplified = simplifyPolyline(rightEdge.reverse(), epsilon);
  const toImage = ([x, y]: Point): Point => [
    Math.round((searchLeft + x * scaleX) * 10) / 10,
    Math.round((searchTop + y * scaleY) * 10) / 10,
  ];
  const polygon = [...leftSimplified, ...rightSimplified].map(toImage);

  const confidence = clamp(
    0.5 +
      Math.min(0.3, dilatedCount / textArea / 10) -
      touchedEdges * 0.12 +
      (coverage - 0.7) * 0.5 +
      (compactness - 0.72) * 0.3,
    0,
    1,
  );

  return {
    result: {
      polygon,
      fillColor: toHex(fr, fg, fb),
      luma: luminance(fr, fg, fb),
      confidence,
    },
    touchedEdges,
  };
};

// ---------------------------------------------------------------------------
// Fills. They mutate the raw buffer in place.

const paintSpan = (
  image: RawImage,
  y: number,
  left: number,
  right: number,
  rgb: readonly [number, number, number],
) => {
  if (y < 0 || y >= image.height) return;
  const x0 = clamp(Math.round(left), 0, image.width);
  const x1 = clamp(Math.round(right), 0, image.width);
  let offset = (y * image.width + x0) * image.channels;
  for (let x = x0; x < x1; x += 1) {
    image.data[offset] = rgb[0];
    image.data[offset + 1] = rgb[1];
    image.data[offset + 2] = rgb[2];
    if (image.channels === 4) image.data[offset + 3] = 255;
    offset += image.channels;
  }
};

export const fillPolygon = (image: RawImage, points: Point[], color: string) => {
  const rgb = hexToRgb(color);
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of points) {
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const y0 = clamp(Math.floor(minY), 0, image.height - 1);
  const y1 = clamp(Math.ceil(maxY), 0, image.height - 1);
  for (let y = y0; y <= y1; y += 1) {
    const scan = y + 0.5;
    const xs: number[] = [];
    for (let i = 0; i < points.length; i += 1) {
      const [x1, py1] = points[i];
      const [x2, py2] = points[(i + 1) % points.length];
      if (py1 === py2) continue;
      const inRange = py1 < py2 ? scan >= py1 && scan < py2 : scan >= py2 && scan < py1;
      if (!inRange) continue;
      xs.push(x1 + ((scan - py1) * (x2 - x1)) / (py2 - py1));
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      paintSpan(image, y, xs[i], xs[i + 1], rgb);
    }
  }
};

export const fillEllipse = (image: RawImage, box: Box, color: string) => {
  const rgb = hexToRgb(color);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const rx = box.w / 2;
  const ry = box.h / 2;
  if (rx <= 0 || ry <= 0) return;
  const y0 = clamp(Math.floor(box.y), 0, image.height - 1);
  const y1 = clamp(Math.ceil(box.y + box.h), 0, image.height - 1);
  for (let y = y0; y <= y1; y += 1) {
    const t = (y + 0.5 - cy) / ry;
    if (t < -1 || t > 1) continue;
    const dx = rx * Math.sqrt(1 - t * t);
    paintSpan(image, y, cx - dx, cx + dx, rgb);
  }
};

export const fillRoundedRect = (
  image: RawImage,
  box: Box,
  radiusRatio: number,
  color: string,
) => {
  const rgb = hexToRgb(color);
  const radius = Math.min(box.w, box.h) * clamp(radiusRatio, 0, 0.5);
  const y0 = clamp(Math.floor(box.y), 0, image.height - 1);
  const y1 = clamp(Math.ceil(box.y + box.h), 0, image.height - 1);
  for (let y = y0; y <= y1; y += 1) {
    const scan = y + 0.5;
    if (scan < box.y || scan > box.y + box.h) continue;
    let inset = 0;
    if (radius > 0) {
      const fromTop = scan - box.y;
      const fromBottom = box.y + box.h - scan;
      const d = Math.min(fromTop, fromBottom);
      if (d < radius) {
        inset = radius - Math.sqrt(Math.max(0, radius * radius - (radius - d) ** 2));
      }
    }
    paintSpan(image, y, box.x + inset, box.x + box.w - inset, rgb);
  }
};
