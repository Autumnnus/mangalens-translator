import { Box, Point, RegionStyle } from "./types";

/**
 * Text fitting engine shared by the server renderer and the browser preview.
 * It is deliberately independent of any font library: callers supply a
 * `FontMetrics` implementation so both sides measure with the same font file.
 */

export interface FontMetrics {
  /** Advance width in pixels for `text` at `fontSize`, including letter spacing. */
  measure(text: string, fontSize: number, letterSpacing: number): number;
  /** Ascender as a fraction of the font size (positive). */
  ascent: number;
  /** Descender as a fraction of the font size (positive). */
  descent: number;
}

/** Horizontal span available at a given y, or null when y is outside. */
export type Chord = { left: number; right: number };

export interface Shape {
  bounds: Box;
  chordAt(y: number): Chord | null;
}

export const rectShape = (box: Box): Shape => ({
  bounds: box,
  chordAt: (y) =>
    y < box.y || y > box.y + box.h
      ? null
      : { left: box.x, right: box.x + box.w },
});

export const ellipseShape = (box: Box): Shape => {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const rx = box.w / 2;
  const ry = box.h / 2;
  return {
    bounds: box,
    chordAt: (y) => {
      if (ry <= 0 || rx <= 0) return null;
      const t = (y - cy) / ry;
      if (t < -1 || t > 1) return null;
      const dx = rx * Math.sqrt(Math.max(0, 1 - t * t));
      return { left: cx - dx, right: cx + dx };
    },
  };
};

const polygonBoundsOf = (points: Point[]): Box => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
};

/**
 * Scanline intersection. For concave outlines (a bubble with a tail) the span
 * that contains the horizontal centre wins, falling back to the widest one.
 */
export const polygonShape = (points: Point[]): Shape => {
  const bounds = polygonBoundsOf(points);
  const cx = bounds.x + bounds.w / 2;
  return {
    bounds,
    chordAt: (y) => {
      const xs: number[] = [];
      for (let i = 0; i < points.length; i += 1) {
        const [x1, y1] = points[i];
        const [x2, y2] = points[(i + 1) % points.length];
        if (y1 === y2) continue;
        const inRange = y1 < y2 ? y >= y1 && y < y2 : y >= y2 && y < y1;
        if (!inRange) continue;
        xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
      }
      if (xs.length < 2) return null;
      xs.sort((a, b) => a - b);
      let best: Chord | null = null;
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const span = { left: xs[i], right: xs[i + 1] };
        if (span.left <= cx && cx <= span.right) return span;
        if (!best || span.right - span.left > best.right - best.left) {
          best = span;
        }
      }
      return best;
    },
  };
};

/** Shrinks any shape by a horizontal and vertical inset. */
export const insetShape = (shape: Shape, dx: number, dy: number): Shape => {
  const b = shape.bounds;
  const bounds = {
    x: b.x + dx,
    y: b.y + dy,
    w: Math.max(0, b.w - dx * 2),
    h: Math.max(0, b.h - dy * 2),
  };
  return {
    bounds,
    chordAt: (y) => {
      if (y < bounds.y || y > bounds.y + bounds.h) return null;
      const chord = shape.chordAt(y);
      if (!chord) return null;
      const left = chord.left + dx;
      const right = chord.right - dx;
      return right > left ? { left, right } : null;
    },
  };
};

export interface TypesetLine {
  text: string;
  /** Left edge of the line's ink box. */
  x: number;
  baseline: number;
  width: number;
  /** Chord centre at this line, used for centre alignment. */
  centerX: number;
}

export interface TypesetResult {
  fontSize: number;
  lineHeight: number;
  lines: TypesetLine[];
  /** True when the text could not be made to fit even at the minimum size. */
  overflow: boolean;
  block: Box;
}

export interface TypesetOptions {
  text: string;
  shape: Shape;
  style: Pick<
    RegionStyle,
    "fontSize" | "lineHeight" | "align" | "letterSpacing" | "uppercase"
  >;
  metrics: FontMetrics;
  minFontSize: number;
  maxFontSize: number;
  /** Turkish needs locale-aware casing ("i" -> "İ"). */
  locale?: string;
}

const WHITESPACE = /\s+/;

const tokenize = (text: string): string[][] =>
  text
    .replace(/\r/g, "")
    .split("\n")
    .map((paragraph) => paragraph.split(WHITESPACE).filter(Boolean));

/** Splits a word that cannot fit on any line into hyphenated chunks. */
const splitWord = (
  word: string,
  maxWidth: number,
  measure: (text: string) => number,
): string[] => {
  if (measure(word) <= maxWidth) return [word];
  const chunks: string[] = [];
  const characters = Array.from(word);
  let current = "";
  for (let i = 0; i < characters.length; i += 1) {
    const character = characters[i];
    const isLast = i === characters.length - 1;
    const candidate = current + character + (isLast ? "" : "-");
    if (current && measure(candidate) > maxWidth) {
      chunks.push(current + "-");
      current = character;
    } else {
      current += character;
    }
  }
  if (current) chunks.push(current);
  return chunks;
};

type LinePlan = { widths: number[]; tops: number[]; centers: number[] };

const planLines = (
  shape: Shape,
  count: number,
  lineHeight: number,
  glyphHeight: number,
): LinePlan | null => {
  const b = shape.bounds;
  const total = count * lineHeight;
  if (total > b.h + 0.01) return null;
  const top = b.y + (b.h - total) / 2;
  const widths: number[] = [];
  const tops: number[] = [];
  const centers: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const lineTop = top + i * lineHeight;
    // Sample the ink band of the line, not the whole leading box.
    const inkTop = lineTop + (lineHeight - glyphHeight) / 2;
    const inkBottom = inkTop + glyphHeight;
    const samples = [inkTop, (inkTop + inkBottom) / 2, inkBottom];
    let left = -Infinity;
    let right = Infinity;
    for (const y of samples) {
      const chord = shape.chordAt(Math.min(Math.max(y, b.y), b.y + b.h));
      if (!chord) return null;
      left = Math.max(left, chord.left);
      right = Math.min(right, chord.right);
    }
    if (right - left <= 0) return null;
    widths.push(right - left);
    tops.push(lineTop);
    centers.push((left + right) / 2);
  }
  return { widths, tops, centers };
};

/**
 * Splits `words` into exactly `widths.length` lines, minimising raggedness.
 * Returns null when no split respects every width.
 */
const breakIntoLines = (
  words: string[],
  wordWidths: number[],
  spaceWidth: number,
  widths: number[],
): { lines: string[]; cost: number } | null => {
  const n = words.length;
  const k = widths.length;
  if (n === 0 || k === 0 || k > n) return null;
  const INF = Number.POSITIVE_INFINITY;
  // best[j][i]: min cost placing first i words into j lines.
  const best: number[][] = Array.from({ length: k + 1 }, () =>
    new Array<number>(n + 1).fill(INF),
  );
  const prev: number[][] = Array.from({ length: k + 1 }, () =>
    new Array<number>(n + 1).fill(-1),
  );
  best[0][0] = 0;
  for (let j = 1; j <= k; j += 1) {
    const width = widths[j - 1];
    for (let i = j; i <= n; i += 1) {
      let lineWidth = 0;
      for (let start = i - 1; start >= j - 1; start -= 1) {
        lineWidth += wordWidths[start] + (start < i - 1 ? spaceWidth : 0);
        if (lineWidth > width) break;
        if (best[j - 1][start] === INF) continue;
        const slack = (width - lineWidth) / width;
        // The last line may be short; middle lines should be even.
        const weight = j === k ? 0.35 : 1;
        const cost = best[j - 1][start] + slack * slack * weight;
        if (cost < best[j][i]) {
          best[j][i] = cost;
          prev[j][i] = start;
        }
      }
    }
  }
  if (best[k][n] === INF) return null;
  const lines: string[] = [];
  let end = n;
  for (let j = k; j >= 1; j -= 1) {
    const start = prev[j][end];
    lines.unshift(words.slice(start, end).join(" "));
    end = start;
  }
  return { lines, cost: best[k][n] };
};

const layoutAtSize = (
  paragraphs: string[][],
  fontSize: number,
  options: TypesetOptions,
  allowOverflow: boolean,
  allowSplit = allowOverflow,
): TypesetResult | null => {
  const { shape, metrics, style } = options;
  const lineHeight = fontSize * style.lineHeight;
  const glyphHeight = fontSize * (metrics.ascent + metrics.descent);
  const measure = (text: string) =>
    metrics.measure(text, fontSize, style.letterSpacing);
  const spaceWidth = measure("a a") - measure("aa");
  const maxLines = Math.max(1, Math.floor((shape.bounds.h + 0.01) / lineHeight));
  const widestChord = (() => {
    let widest = 0;
    const steps = 12;
    for (let i = 0; i <= steps; i += 1) {
      const y = shape.bounds.y + (shape.bounds.h * i) / steps;
      const chord = shape.chordAt(y);
      if (chord) widest = Math.max(widest, chord.right - chord.left);
    }
    return widest;
  })();
  if (widestChord <= 0) return null;

  // Hyphenating a word is a last resort: while searching for the largest
  // font size, a word that cannot fit on the widest line makes this size
  // infeasible, so a smaller size without a split wins.
  const needsSplit = paragraphs.some((paragraph) =>
    paragraph.some((word) => measure(word) > widestChord),
  );
  if (needsSplit && !allowSplit) return null;
  const words = paragraphs.map((paragraph) =>
    paragraph.flatMap((word) => splitWord(word, widestChord, measure)),
  );
  const forcedBreaks = words.length - 1;
  const totalWords = words.reduce((sum, list) => sum + list.length, 0);
  if (totalWords === 0) return null;

  let bestPlan: {
    plan: LinePlan;
    lines: string[];
    cost: number;
  } | null = null;

  for (let count = Math.max(1, words.length); count <= maxLines; count += 1) {
    const plan = planLines(shape, count, lineHeight, glyphHeight);
    if (!plan) break;
    // Distribute line budget across forced paragraphs.
    const distribute = (remaining: number, index: number): string[] | null => {
      if (index === words.length) return remaining === 0 ? [] : null;
      const paragraph = words[index];
      const wordWidths = paragraph.map(measure);
      const minLines = 1;
      const maxLinesHere = remaining - (words.length - index - 1);
      let best: { lines: string[]; cost: number } | null = null;
      for (let take = minLines; take <= maxLinesHere; take += 1) {
        const offset = count - remaining;
        const widths = plan.widths.slice(offset, offset + take);
        const broken = breakIntoLines(
          paragraph,
          wordWidths,
          spaceWidth,
          widths,
        );
        if (!broken) continue;
        const rest = distribute(remaining - take, index + 1);
        if (!rest) continue;
        const cost = broken.cost + rest.length * 0.02;
        if (!best || cost < best.cost) {
          best = { lines: [...broken.lines, ...rest], cost };
        }
      }
      return best?.lines ?? null;
    };
    const lines = distribute(count, 0);
    if (!lines) continue;
    const cost =
      lines.reduce((sum, line, index) => {
        const slack = (plan.widths[index] - measure(line)) / plan.widths[index];
        return sum + slack * slack;
      }, 0) +
      count * 0.05;
    if (!bestPlan || cost < bestPlan.cost) bestPlan = { plan, lines, cost };
  }

  if (!bestPlan) {
    if (!allowOverflow) return null;
    // Greedy wrap at the widest chord; lines may spill past the area.
    const lines: string[] = [];
    for (const paragraph of words) {
      let line = "";
      for (const word of paragraph) {
        const candidate = line ? `${line} ${word}` : word;
        if (!line || measure(candidate) <= widestChord) {
          line = candidate;
        } else {
          lines.push(line);
          line = word;
        }
      }
      if (line) lines.push(line);
    }
    const b = shape.bounds;
    const top = b.y + (b.h - lines.length * lineHeight) / 2;
    const cx = b.x + b.w / 2;
    return finish(
      lines,
      {
        widths: lines.map(() => widestChord),
        tops: lines.map((_, index) => top + index * lineHeight),
        centers: lines.map(() => cx),
      },
      fontSize,
      lineHeight,
      options,
      measure,
      true,
    );
  }
  void forcedBreaks;
  return finish(
    bestPlan.lines,
    bestPlan.plan,
    fontSize,
    lineHeight,
    options,
    measure,
    false,
  );
};

const finish = (
  lines: string[],
  plan: LinePlan,
  fontSize: number,
  lineHeight: number,
  options: TypesetOptions,
  measure: (text: string) => number,
  overflow: boolean,
): TypesetResult => {
  const { metrics, style } = options;
  const glyphHeight = fontSize * (metrics.ascent + metrics.descent);
  const placed: TypesetLine[] = lines.map((text, index) => {
    const width = measure(text);
    const centerX = plan.centers[index];
    const available = plan.widths[index];
    const x =
      style.align === "left"
        ? centerX - available / 2
        : style.align === "right"
          ? centerX + available / 2 - width
          : centerX - width / 2;
    const baseline =
      plan.tops[index] +
      (lineHeight - glyphHeight) / 2 +
      metrics.ascent * fontSize;
    return { text, x, baseline, width, centerX };
  });
  const left = Math.min(...placed.map((line) => line.x));
  const right = Math.max(...placed.map((line) => line.x + line.width));
  return {
    fontSize,
    lineHeight,
    lines: placed,
    overflow,
    block: {
      x: left,
      y: plan.tops[0] ?? options.shape.bounds.y,
      w: Math.max(0, right - left),
      h: lines.length * lineHeight,
    },
  };
};

export const typesetText = (options: TypesetOptions): TypesetResult | null => {
  const { style } = options;
  const source = style.uppercase
    ? options.text.toLocaleUpperCase(options.locale || "tr")
    : options.text;
  const paragraphs = tokenize(source);
  if (paragraphs.every((paragraph) => paragraph.length === 0)) return null;

  if (style.fontSize !== "auto") {
    return layoutAtSize(paragraphs, style.fontSize, options, true);
  }

  const min = Math.min(options.minFontSize, options.maxFontSize);
  const max = Math.max(options.minFontSize, options.maxFontSize);

  // Largest size at which the text fits; hyphenation optionally allowed.
  const search = (allowSplit: boolean): TypesetResult | null => {
    const atMax = layoutAtSize(paragraphs, max, options, false, allowSplit);
    if (atMax) return atMax;
    let low = min;
    let high = max;
    let best: TypesetResult | null = null;
    for (let iteration = 0; iteration < 14; iteration += 1) {
      const mid = (low + high) / 2;
      const attempt = layoutAtSize(paragraphs, mid, options, false, allowSplit);
      if (attempt) {
        best = attempt;
        low = mid;
      } else {
        high = mid;
      }
      if (high - low < 0.15) break;
    }
    return best;
  };

  // Hyphenation is ugly, so it only wins when it buys clearly larger text
  // (a single very long word in a narrow balloon).
  const unsplit = search(false);
  const split = search(true);
  if (split && (!unsplit || split.fontSize > unsplit.fontSize * 1.35)) {
    return split;
  }
  if (unsplit) return unsplit;
  return layoutAtSize(paragraphs, min, options, true);
};
