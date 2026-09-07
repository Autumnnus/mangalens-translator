import * as opentype from "opentype.js";
import { FontFamilyId, FontWeight, resolveFontFace } from "./fonts";
import { FontMetrics } from "./typeset";

/**
 * opentype.js adapter. Text is converted to outline paths, so the rendered
 * SVG has no font dependency at rasterisation time and measures identically in
 * Node and in the browser.
 *
 * Glyphs are placed one character at a time with pair kerning instead of
 * going through opentype's GSUB shaping: the shaper rejects the chained
 * context lookups these fonts carry, and Turkish/Latin text needs no
 * ligatures or contextual forms. Text is normalised to NFC first so accented
 * letters map to their precomposed glyphs.
 */

export interface LoadedFont {
  font: opentype.Font;
  metrics: FontMetrics;
}

type Os2Table = { sTypoAscender?: number; sTypoDescender?: number };

interface PlacedGlyph {
  glyph: opentype.Glyph;
  x: number;
}

const layoutGlyphs = (
  font: opentype.Font,
  text: string,
  fontSize: number,
  letterSpacing: number,
): { glyphs: PlacedGlyph[]; width: number } => {
  const scale = fontSize / (font.unitsPerEm || 1000);
  const spacing = letterSpacing * fontSize;
  const glyphs: PlacedGlyph[] = [];
  let x = 0;
  let previous: opentype.Glyph | null = null;
  for (const character of Array.from(text.normalize("NFC"))) {
    const glyph = font.charToGlyph(character);
    if (previous) x += font.getKerningValue(previous, glyph) * scale;
    glyphs.push({ glyph, x });
    x += (glyph.advanceWidth ?? 0) * scale + spacing;
    previous = glyph;
  }
  // Trailing letter spacing is not visible ink.
  const width = glyphs.length > 0 ? Math.max(0, x - spacing) : 0;
  return { glyphs, width };
};

export const parseFont = (buffer: ArrayBuffer): LoadedFont => {
  const font = opentype.parse(buffer);
  const upm = font.unitsPerEm || 1000;
  const os2 = (font.tables as { os2?: Os2Table }).os2;
  const ascender = os2?.sTypoAscender ?? font.ascender;
  const descender = os2?.sTypoDescender ?? font.descender;
  const cache = new Map<string, number>();
  return {
    font,
    metrics: {
      ascent: ascender / upm,
      descent: Math.abs(descender) / upm,
      measure: (text, fontSize, letterSpacing) => {
        // Measure at 1000px and scale: kerning and advances are linear.
        const key = `${letterSpacing}|${text}`;
        let base = cache.get(key);
        if (base === undefined) {
          base = layoutGlyphs(font, text, 1000, letterSpacing).width;
          cache.set(key, base);
        }
        return (base * fontSize) / 1000;
      },
    },
  };
};

const fmt = (value: number | undefined) => {
  const rounded = Math.round((value ?? 0) * 100) / 100;
  return Number.isFinite(rounded) ? String(rounded) : "0";
};

/**
 * Serialises path commands ourselves. opentype.js' own `toPathData` formats
 * numbers through string arithmetic and emits NaN when a fractional part
 * lands in exponent notation (e.g. 284.85000000001), which silently truncates
 * the glyph run in librsvg.
 */
const commandsToPathData = (commands: opentype.PathCommand[]) => {
  let d = "";
  for (const command of commands) {
    switch (command.type) {
      case "M":
      case "L":
        d += `${command.type}${fmt(command.x)} ${fmt(command.y)}`;
        break;
      case "Q":
        d += `Q${fmt(command.x1)} ${fmt(command.y1)} ${fmt(command.x)} ${fmt(command.y)}`;
        break;
      case "C":
        d += `C${fmt(command.x1)} ${fmt(command.y1)} ${fmt(command.x2)} ${fmt(command.y2)} ${fmt(command.x)} ${fmt(command.y)}`;
        break;
      case "Z":
        d += "Z";
        break;
      default:
        break;
    }
  }
  return d;
};

export const textToPathData = (
  loaded: LoadedFont,
  text: string,
  x: number,
  baseline: number,
  fontSize: number,
  letterSpacing: number,
) => {
  const { glyphs } = layoutGlyphs(loaded.font, text, fontSize, letterSpacing);
  return glyphs
    .map(({ glyph, x: offset }) =>
      commandsToPathData(glyph.getPath(x + offset, baseline, fontSize).commands),
    )
    .filter(Boolean)
    .join("");
};

export interface FontSet {
  resolve(family: FontFamilyId, weight: FontWeight, italic: boolean): LoadedFont;
}

/** Wraps parsed fonts keyed by file name into a family/weight lookup. */
export const createFontSet = (files: Map<string, LoadedFont>): FontSet => ({
  resolve: (family, weight, italic) => {
    const face = resolveFontFace(family, weight, italic);
    const loaded = files.get(face.file);
    if (!loaded) {
      throw new Error(`Font file is not loaded: ${face.file}`);
    }
    return loaded;
  },
});
