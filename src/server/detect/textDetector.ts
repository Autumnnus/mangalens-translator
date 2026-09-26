import { Box } from "@/layout/types";
import path from "node:path";
import sharp from "sharp";

/**
 * Local text-line detector (PaddleOCR DBNet, ONNX, WebAssembly). It gives
 * pixel-accurate boxes for every line of lettering on a page; Gemini then only
 * reads and translates what is inside numbered boxes. No coordinates ever come
 * from the language model.
 */

export interface TextLine {
  box: Box;
  score: number;
}

export interface TextBlock {
  /** Union of the lines: one balloon or caption. */
  box: Box;
  lines: TextLine[];
  score: number;
  /**
   * Indices (into the returned block list) of neighbouring blocks that an
   * outline or border separates from this one. The reading model's
   * "same balloon" merges are refused for these.
   */
  separatedFrom?: number[];
}

export interface DetectorOptions {
  /** Long edge the page is resized to before inference (multiple of 32). */
  maxEdge?: number;
  /** Probability threshold for the binary map. */
  threshold?: number;
  /** Minimum mean probability of a region to be kept. */
  boxThreshold?: number;
  /** DB shrink compensation. */
  unclipRatio?: number;
}

const MODEL_PATH = path.join(process.cwd(), "models", "ppocr-v4-det.onnx");
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

type OrtModule = typeof import("onnxruntime-web");
type Session = Awaited<ReturnType<OrtModule["InferenceSession"]["create"]>>;

const globalCache = globalThis as unknown as {
  __textDetector?: Promise<{ ort: OrtModule; session: Session }>;
};

const loadSession = () => {
  if (!globalCache.__textDetector) {
    globalCache.__textDetector = (async () => {
      const ort = await import("onnxruntime-web");
      ort.env.wasm.numThreads = 1;
      ort.env.logLevel = "error";
      const session = await ort.InferenceSession.create(MODEL_PATH, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      });
      return { ort, session };
    })().catch((error) => {
      globalCache.__textDetector = undefined;
      throw error;
    });
  }
  return globalCache.__textDetector;
};

export const isTextDetectorAvailable = async () => {
  try {
    await loadSession();
    return true;
  } catch (error) {
    console.warn("Text detector unavailable", error);
    return false;
  }
};

const roundTo32 = (value: number) => Math.max(32, Math.round(value / 32) * 32);

/** Runs the detector and returns text lines in original pixel coordinates. */
export const detectTextLines = async (
  original: Buffer,
  options: DetectorOptions = {},
): Promise<{ lines: TextLine[]; width: number; height: number; durationMs: number }> => {
  const maxEdge = options.maxEdge ?? 960;
  const threshold = options.threshold ?? 0.3;
  const boxThreshold = options.boxThreshold ?? 0.45;
  const unclipRatio = options.unclipRatio ?? 1.6;

  const started = Date.now();
  const source = sharp(original, { limitInputPixels: 120_000_000 }).rotate();
  const metadata = await source.metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;
  if (!width || !height) throw new Error("Image dimensions could not be read");

  // Small scans are upscaled: the detector was trained on text taller than a
  // handful of pixels.
  const longEdge = Math.max(width, height);
  const scale = longEdge < maxEdge ? Math.min(maxEdge / longEdge, 2.5) : maxEdge / longEdge;
  const w = roundTo32(width * scale);
  const h = roundTo32(height * scale);
  const { data } = await source
    .resize(w, h, { fit: "fill", kernel: "lanczos3" })
    .flatten({ background: "#ffffff" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const plane = w * h;
  const input = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i += 1) {
    // The Paddle model expects BGR channel order.
    input[i] = (data[i * 3 + 2] / 255 - MEAN[0]) / STD[0];
    input[plane + i] = (data[i * 3 + 1] / 255 - MEAN[1]) / STD[1];
    input[2 * plane + i] = (data[i * 3] / 255 - MEAN[2]) / STD[2];
  }

  const { ort, session } = await loadSession();
  const output = await session.run({
    [session.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, h, w]),
  });
  const prob = output[session.outputNames[0]].data as Float32Array;

  // Connected components of the binary map -> candidate lines.
  const labels = new Int32Array(plane);
  const queue = new Int32Array(plane);
  const lines: TextLine[] = [];
  const scaleX = width / w;
  const scaleY = height / h;
  for (let start = 0; start < plane; start += 1) {
    if (labels[start] || prob[start] < threshold) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    labels[start] = 1;
    let minX = w;
    let maxX = -1;
    let minY = h;
    let maxY = -1;
    let sum = 0;
    while (head < tail) {
      const index = queue[head++];
      const x = index % w;
      const y = (index - x) / w;
      sum += prob[index];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const neighbours = [x > 0 ? index - 1 : -1, x < w - 1 ? index + 1 : -1, y > 0 ? index - w : -1, y < h - 1 ? index + w : -1];
      for (const next of neighbours) {
        if (next >= 0 && !labels[next] && prob[next] >= threshold) {
          labels[next] = 1;
          queue[tail++] = next;
        }
      }
    }
    const area = tail;
    if (area < 12) continue;
    const score = sum / area;
    if (score < boxThreshold) continue;
    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    // DB predicts shrunk regions; grow the box back (Vatti-style offset).
    const offset = (bw * bh * unclipRatio) / (2 * (bw + bh));
    const box: Box = {
      x: Math.max(0, (minX - offset) * scaleX),
      y: Math.max(0, (minY - offset) * scaleY),
      w: Math.min(width, (bw + 2 * offset) * scaleX),
      h: Math.min(height, (bh + 2 * offset) * scaleY),
    };
    if (box.w < 3 || box.h < 3) continue;
    lines.push({ box, score });
  }

  return { lines, width, height, durationMs: Date.now() - started };
};

const overlap = (a0: number, a1: number, b0: number, b1: number) =>
  Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

type Relation = "stacked" | "inline" | null;

const relationOf = (a: Box, b: Box): Relation => {
  const overlapX = overlap(a.x, a.x + a.w, b.x, b.x + b.w) / Math.max(1, Math.min(a.w, b.w));
  const overlapY = overlap(a.y, a.y + a.h, b.y, b.y + b.h) / Math.max(1, Math.min(a.h, b.h));
  const gapY = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
  const gapX = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
  const minH = Math.min(a.h, b.h);
  const minW = Math.min(a.w, b.w);
  // Stacked lines of one balloon, or words of one line split by the detector.
  if (overlapX >= 0.2 && gapY <= minH * 0.9) return "stacked";
  if (overlapY >= 0.4 && gapX <= minW * 0.6) return "inline";
  return null;
};

/** Raw RGB(A) pixels of the page, used to look for outlines between lines. */
export interface PagePixels {
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
  channels: number;
}

const lumaAt = (image: PagePixels, x: number, y: number) => {
  const offset = (y * image.width + x) * image.channels;
  return (
    image.data[offset] * 0.299 + image.data[offset + 1] * 0.587 + image.data[offset + 2] * 0.114
  );
};

/** The glyph band of a line: its box without the unclip margin across the line. */
const lineCore = (box: Box): Box =>
  box.w >= box.h
    ? { x: box.x, y: box.y + box.h * 0.25, w: box.w, h: box.h * 0.5 }
    : { x: box.x + box.w * 0.25, y: box.y, w: box.w * 0.5, h: box.h };

const MAX_WINDOW_PIXELS = 4_000_000;

/**
 * Whether the background around line `a` reaches line `b` without crossing
 * dark pixels, inside the pair's bounding box. Lines of one balloon are
 * always connected through the leading between them; lines of two balloons
 * are not, because each balloon is closed by its outline (or a panel
 * border). Returns null when the test says nothing: dark backgrounds (white
 * lettering) or huge windows.
 */
export const backgroundConnected = (image: PagePixels, a: Box, b: Box): boolean | null => {
  const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x)));
  const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y)));
  const x1 = Math.min(image.width - 1, Math.ceil(Math.max(a.x + a.w, b.x + b.w)));
  const y1 = Math.min(image.height - 1, Math.ceil(Math.max(a.y + a.h, b.y + b.h)));
  const width = x1 - x0 + 1;
  const height = y1 - y0 + 1;
  if (width < 3 || height < 3 || width * height > MAX_WINDOW_PIXELS) return null;

  const lumas = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) lumas[y * width + x] = lumaAt(image, x0 + x, y0 + y);
  }
  const sample: number[] = [];
  const step = Math.max(1, Math.floor(lumas.length / 4000));
  for (let i = 0; i < lumas.length; i += step) sample.push(lumas[i]);
  sample.sort((p, q) => p - q);
  const background = sample[Math.floor(sample.length / 2)];
  if (background < 128) return null;
  const threshold = Math.max(140, background - 60);

  const inBox = (box: Box, x: number, y: number) =>
    x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h;
  const coreA = lineCore(a);
  const coreB = lineCore(b);
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  for (let y = Math.max(y0, Math.floor(coreA.y)); y < Math.min(y1 + 1, coreA.y + coreA.h); y += 1) {
    for (let x = Math.max(x0, Math.floor(coreA.x)); x < Math.min(x1 + 1, coreA.x + coreA.w); x += 1) {
      const index = (y - y0) * width + (x - x0);
      if (lumas[index] >= threshold && !visited[index]) {
        visited[index] = 1;
        queue[tail++] = index;
      }
    }
  }
  if (tail === 0) return null;
  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    const y = (index - x) / width;
    if (inBox(coreB, x0 + x, y0 + y) && !inBox(coreA, x0 + x, y0 + y)) return true;
    const neighbours = [
      x > 0 ? index - 1 : -1,
      x < width - 1 ? index + 1 : -1,
      y > 0 ? index - width : -1,
      y < height - 1 ? index + width : -1,
    ];
    for (const next of neighbours) {
      if (next >= 0 && !visited[next] && lumas[next] >= threshold) {
        visited[next] = 1;
        queue[tail++] = next;
      }
    }
  }
  return false;
};

/** Median luminance of a line's glyph band. */
const bandLuma = (image: PagePixels, box: Box) => {
  const core = lineCore(box);
  const x0 = Math.max(0, Math.floor(core.x));
  const y0 = Math.max(0, Math.floor(core.y));
  const x1 = Math.min(image.width, Math.ceil(core.x + core.w));
  const y1 = Math.min(image.height, Math.ceil(core.y + core.h));
  const stepX = Math.max(1, Math.floor((x1 - x0) / 240));
  const stepY = Math.max(1, Math.floor((y1 - y0) / 240));
  const values: number[] = [];
  for (let y = y0; y < y1; y += stepY) {
    for (let x = x0; x < x1; x += stepX) values.push(lumaAt(image, x, y));
  }
  if (values.length === 0) return 255;
  values.sort((p, q) => p - q);
  return values[Math.floor(values.length / 2)];
};

/**
 * Gap between the glyph bands of two stacked lines, in multiples of the
 * glyph band height. Leading inside a balloon is well under one band; two
 * balloons joined by a connector, or a paragraph break, leave more.
 */
export const stackedGapRatio = (image: PagePixels, a: Box, b: Box): number | null => {
  const [upper, lower] = a.y <= b.y ? [a, b] : [b, a];
  const x0 = Math.max(upper.x, lower.x);
  const x1 = Math.min(upper.x + upper.w, lower.x + lower.w);
  const inset = (x1 - x0) * 0.05;
  const left = Math.max(0, Math.round(x0 + inset));
  const right = Math.min(image.width - 1, Math.round(x1 - inset));
  const top = Math.max(0, Math.round(upper.y + upper.h / 2));
  const bottom = Math.min(image.height - 1, Math.round(lower.y + lower.h / 2));
  if (right - left < 4 || bottom - top < 3) return null;
  const width = right - left + 1;
  const inked: boolean[] = [];
  for (let y = top; y <= bottom; y += 1) {
    let dark = 0;
    for (let x = left; x <= right; x += 1) if (lumaAt(image, x, y) < 100) dark += 1;
    inked.push(dark / width >= 0.04);
  }
  let upperBand = 0;
  while (upperBand < inked.length && inked[upperBand]) upperBand += 1;
  let lowerBand = 0;
  while (lowerBand < inked.length - upperBand && inked[inked.length - 1 - lowerBand]) lowerBand += 1;
  const gap = inked.length - upperBand - lowerBand;
  // Each walk covers half a band (from the line centre outwards).
  const band = upperBand + lowerBand;
  if (band < 2) return null;
  return gap / band;
};

/**
 * Groups lines into balloon/caption blocks (union-find on proximity). With
 * the page pixels, two lines are only merged when they sit on the same kind
 * of surface and their backgrounds connect (no outline or border between
 * them), stacked lines must not leave more
 * than a line of empty space, and lines of very different lettering size (a
 * caption next to a sound effect) stay apart.
 */
export const groupTextLines = (lines: TextLine[], image?: PagePixels): TextBlock[] => {
  const parents = lines.map((_, index) => index);
  const find = (index: number): number => {
    while (parents[index] !== index) {
      parents[index] = parents[parents[index]];
      index = parents[index];
    }
    return index;
  };
  const thickness = (box: Box) => Math.max(1, Math.min(box.w, box.h));
  // Lines of one balloon share a surface: light paper or a dark balloon. A
  // "line" found in dark artwork next to a white balloon (hatching, rain)
  // must not bridge it to the next balloon. Only clear cases count; small
  // anti-aliased lettering sits in between.
  const bands = image ? lines.map((line) => bandLuma(image, line.box)) : [];
  const surfacesDiffer = (i: number, j: number) =>
    (bands[i] >= 160 && bands[j] < 110) || (bands[j] >= 160 && bands[i] < 110);
  const walls: [number, number][] = [];
  for (let i = 0; i < lines.length; i += 1) {
    for (let j = i + 1; j < lines.length; j += 1) {
      const a = lines[i].box;
      const b = lines[j].box;
      const relation = relationOf(a, b);
      if (!relation) continue;
      if (Math.max(thickness(a), thickness(b)) / Math.min(thickness(a), thickness(b)) > 1.6) continue;
      if (image) {
        if (surfacesDiffer(i, j) || backgroundConnected(image, a, b) === false) {
          walls.push([i, j]);
          continue;
        }
        if (relation === "stacked" && (stackedGapRatio(image, a, b) ?? 0) > 1.25) continue;
      }
      const rootA = find(i);
      const rootB = find(j);
      if (rootA !== rootB) parents[rootB] = rootA;
    }
  }
  const groups = new Map<number, number[]>();
  lines.forEach((_, index) => {
    const root = find(index);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(index);
  });
  const drafts = [...groups.values()].map((members) => {
    const group = members.map((index) => lines[index]);
    const sorted = [...group].sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
    const minX = Math.min(...sorted.map((line) => line.box.x));
    const minY = Math.min(...sorted.map((line) => line.box.y));
    const maxX = Math.max(...sorted.map((line) => line.box.x + line.box.w));
    const maxY = Math.max(...sorted.map((line) => line.box.y + line.box.h));
    return {
      members,
      block: {
        box: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
        lines: sorted,
        score: sorted.reduce((sum, line) => sum + line.score, 0) / sorted.length,
      } as TextBlock,
    };
  });
  // Reading order for the overlay numbering: top to bottom, then left to right.
  drafts.sort((a, b) => a.block.box.y - b.block.box.y || a.block.box.x - b.block.box.x);
  const blockOfLine = new Map<number, number>();
  drafts.forEach((draft, blockIndex) => draft.members.forEach((line) => blockOfLine.set(line, blockIndex)));
  for (const [i, j] of walls) {
    const a = blockOfLine.get(i)!;
    const b = blockOfLine.get(j)!;
    if (a === b) continue;
    for (const [from, to] of [[a, b], [b, a]]) {
      const block = drafts[from].block;
      block.separatedFrom = [...new Set([...(block.separatedFrom ?? []), to])].sort((p, q) => p - q);
    }
  }
  return drafts.map((draft) => draft.block);
};

export const detectTextBlocks = async (original: Buffer, options?: DetectorOptions) => {
  const result = await detectTextLines(original, options);
  const { data, info } = await sharp(original, { limitInputPixels: 120_000_000 })
    .rotate()
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels: PagePixels = { data, width: info.width, height: info.height, channels: info.channels };
  return { ...result, blocks: groupTextLines(result.lines, pixels) };
};
