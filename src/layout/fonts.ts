/**
 * Font registry shared by the server renderer and the browser editor. Files
 * live in `public/fonts` so the same bytes are used on both sides.
 */
export const FONT_FAMILY_IDS = ["shantell-sans", "bangers", "nunito"] as const;
export type FontFamilyId = (typeof FONT_FAMILY_IDS)[number];

export type FontWeight = "regular" | "bold";

export interface FontFace {
  file: string;
  weight: FontWeight;
  italic: boolean;
}

export interface FontFamily {
  id: FontFamilyId;
  label: string;
  description: string;
  faces: FontFace[];
}

export const FONT_PUBLIC_PATH = "/fonts";

export const FONT_FAMILIES: Record<FontFamilyId, FontFamily> = {
  "shantell-sans": {
    id: "shantell-sans",
    label: "Shantell Sans",
    description: "Comic lettering for dialogue and thoughts.",
    faces: [
      { file: "ShantellSans_400Regular.ttf", weight: "regular", italic: false },
      {
        file: "ShantellSans_400Regular_Italic.ttf",
        weight: "regular",
        italic: true,
      },
      { file: "ShantellSans_700Bold.ttf", weight: "bold", italic: false },
      { file: "ShantellSans_700Bold_Italic.ttf", weight: "bold", italic: true },
    ],
  },
  bangers: {
    id: "bangers",
    label: "Bangers",
    description: "Loud display face for sound effects and shouting.",
    faces: [{ file: "Bangers_400Regular.ttf", weight: "regular", italic: false }],
  },
  nunito: {
    id: "nunito",
    label: "Nunito",
    description: "Clean rounded sans for captions, labels and narration.",
    faces: [
      { file: "Nunito_400Regular.ttf", weight: "regular", italic: false },
      { file: "Nunito_400Regular_Italic.ttf", weight: "regular", italic: true },
      { file: "Nunito_700Bold.ttf", weight: "bold", italic: false },
      { file: "Nunito_700Bold_Italic.ttf", weight: "bold", italic: true },
    ],
  },
};

export const ALL_FONT_FILES = Object.values(FONT_FAMILIES).flatMap((family) =>
  family.faces.map((face) => face.file),
);

/**
 * Picks the closest available face. Families without a bold or italic cut
 * fall back to the nearest upright/regular face instead of failing.
 */
export const resolveFontFace = (
  family: FontFamilyId,
  weight: FontWeight,
  italic: boolean,
): FontFace => {
  const faces = FONT_FAMILIES[family].faces;
  const exact = faces.find((f) => f.weight === weight && f.italic === italic);
  if (exact) return exact;
  const sameWeight = faces.find((f) => f.weight === weight);
  if (sameWeight) return sameWeight;
  const sameSlant = faces.find((f) => f.italic === italic);
  return sameSlant || faces[0];
};

export const isFontFamilyId = (value: unknown): value is FontFamilyId =>
  typeof value === "string" &&
  (FONT_FAMILY_IDS as readonly string[]).includes(value);
