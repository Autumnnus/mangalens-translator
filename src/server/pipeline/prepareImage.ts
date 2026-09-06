import sharp from "sharp";

/** Longest edge sent to the model. Detection does not improve beyond this. */
export const MODEL_IMAGE_MAX_EDGE = 1568;

export interface ModelImage {
  base64: string;
  mimeType: "image/jpeg";
  /** Original dimensions; detection boxes are mapped into this space. */
  width: number;
  height: number;
  modelWidth: number;
  modelHeight: number;
  bytes: number;
}

/**
 * Normalises the page for the model: EXIF rotation applied, downscaled to a
 * bounded size, re-encoded as JPEG. Coordinates come back normalised to
 * 0-1000, so the downscale does not affect placement on the original.
 */
export const prepareModelImage = async (
  original: Buffer,
  maxEdge = MODEL_IMAGE_MAX_EDGE,
): Promise<ModelImage> => {
  const source = sharp(original, { limitInputPixels: 120_000_000 }).rotate();
  const metadata = await source.metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;
  if (!width || !height) throw new Error("Image dimensions could not be read");

  const { data, info } = await source
    .resize({
      width: maxEdge,
      height: maxEdge,
      fit: "inside",
      withoutEnlargement: true,
    })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });

  return {
    base64: data.toString("base64"),
    mimeType: "image/jpeg",
    width,
    height,
    modelWidth: info.width,
    modelHeight: info.height,
    bytes: data.length,
  };
};
