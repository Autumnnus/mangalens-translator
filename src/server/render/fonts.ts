import { readFile } from "node:fs/promises";
import path from "node:path";
import { createFontSet, FontSet, LoadedFont, parseFont } from "@/layout/fontEngine";
import { ALL_FONT_FILES } from "@/layout/fonts";

const FONT_DIR = path.join(process.cwd(), "public", "fonts");

const globalCache = globalThis as unknown as {
  __mangalensFontCache?: Map<string, LoadedFont>;
};
const cache = globalCache.__mangalensFontCache || new Map<string, LoadedFont>();
globalCache.__mangalensFontCache = cache;

/** Loads and caches every bundled font once per process. */
export const loadServerFonts = async (): Promise<FontSet> => {
  await Promise.all(
    ALL_FONT_FILES.filter((file) => !cache.has(file)).map(async (file) => {
      const bytes = await readFile(path.join(FONT_DIR, file));
      const buffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      );
      cache.set(file, parseFont(buffer));
    }),
  );
  return createFontSet(cache);
};
