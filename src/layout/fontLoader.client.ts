import { createFontSet, FontSet, LoadedFont, parseFont } from "./fontEngine";
import { ALL_FONT_FILES, FONT_PUBLIC_PATH } from "./fonts";

/** Loads the bundled fonts in the browser once; the same bytes the server uses. */
let pending: Promise<FontSet> | null = null;

export const loadBrowserFonts = (): Promise<FontSet> => {
  if (pending) return pending;
  pending = (async () => {
    const files = new Map<string, LoadedFont>();
    await Promise.all(
      ALL_FONT_FILES.map(async (file) => {
        const response = await fetch(`${FONT_PUBLIC_PATH}/${file}`);
        if (!response.ok) throw new Error(`Font could not be loaded: ${file}`);
        files.set(file, parseFont(await response.arrayBuffer()));
      }),
    );
    return createFontSet(files);
  })().catch((error) => {
    pending = null;
    throw error;
  });
  return pending;
};
