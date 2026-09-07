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

const linesTouch = (a: Box, b: Box) => {
  const overlapX = overlap(a.x, a.x + a.w, b.x, b.x + b.w) / Math.max(1, Math.min(a.w, b.w));
  const overlapY = overlap(a.y, a.y + a.h, b.y, b.y + b.h) / Math.max(1, Math.min(a.h, b.h));
  const gapY = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
  const gapX = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
  const minH = Math.min(a.h, b.h);
  const minW = Math.min(a.w, b.w);
  // Stacked lines of one balloon, or words of one line split by the detector.
  return (overlapX >= 0.2 && gapY <= minH * 0.9) || (overlapY >= 0.4 && gapX <= minW * 0.6);
};

/** Groups lines into balloon/caption blocks (union-find on proximity). */
export const groupTextLines = (lines: TextLine[]): TextBlock[] => {
  const parents = lines.map((_, index) => index);
  const find = (index: number): number => {
    while (parents[index] !== index) {
      parents[index] = parents[parents[index]];
      index = parents[index];
    }
    return index;
  };
  for (let i = 0; i < lines.length; i += 1) {
    for (let j = i + 1; j < lines.length; j += 1) {
      if (linesTouch(lines[i].box, lines[j].box)) {
        const a = find(i);
        const b = find(j);
        if (a !== b) parents[b] = a;
      }
    }
  }
  const groups = new Map<number, TextLine[]>();
  lines.forEach((line, index) => {
    const root = find(index);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(line);
  });
  const blocks: TextBlock[] = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
    const minX = Math.min(...sorted.map((line) => line.box.x));
    const minY = Math.min(...sorted.map((line) => line.box.y));
    const maxX = Math.max(...sorted.map((line) => line.box.x + line.box.w));
    const maxY = Math.max(...sorted.map((line) => line.box.y + line.box.h));
    blocks.push({
      box: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
      lines: sorted,
      score: sorted.reduce((sum, line) => sum + line.score, 0) / sorted.length,
    });
  }
  // Reading order for the overlay numbering: top to bottom, then left to right.
  return blocks.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
};

export const detectTextBlocks = async (original: Buffer, options?: DetectorOptions) => {
  const result = await detectTextLines(original, options);
  return { ...result, blocks: groupTextLines(result.lines) };
};
