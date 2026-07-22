import { TextBubble, TranslationSettings } from "../types";
import {
  getModelPixelBox,
  normalizePixelBox,
  refineBubbleRegion,
  RefinedBubbleRegion,
} from "./bubbleGeometry";
import { resolveImageUrl } from "./url";

export interface RenderedTranslation {
  blob: Blob;
  bubbles: TextBubble[];
}

const isSfx = (type: TextBubble["type"]) =>
  type === "sfx" || type === "environmental";

const drawRoundedRect = (
  ctx: CanvasRenderingContext2D,
  box: RefinedBubbleRegion["box"],
  color: string,
  radiusRatio: number,
) => {
  const { left, top, width, height } = box;
  const radius = Math.min(width, height) * radiusRatio;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(left + radius, top);
  ctx.lineTo(left + width - radius, top);
  ctx.quadraticCurveTo(left + width, top, left + width, top + radius);
  ctx.lineTo(left + width, top + height - radius);
  ctx.quadraticCurveTo(
    left + width,
    top + height,
    left + width - radius,
    top + height,
  );
  ctx.lineTo(left + radius, top + height);
  ctx.quadraticCurveTo(left, top + height, left, top + height - radius);
  ctx.lineTo(left, top + radius);
  ctx.quadraticCurveTo(left, top, left + radius, top);
  ctx.closePath();
  ctx.fill();
};
const drawRefinedBackground = (
  ctx: CanvasRenderingContext2D,
  region: RefinedBubbleRegion,
  color: string,
) => {
  ctx.fillStyle = color;
  for (const span of region.spans) {
    ctx.fillRect(
      Math.floor(span.left),
      Math.floor(span.y),
      Math.ceil(span.right - span.left),
      Math.ceil(span.height),
    );
  }
};

const segmentText = (text: string) => {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });
    return Array.from(segmenter.segment(text), (entry) => entry.segment);
  }

  return text.match(/\s+|[^\s]+/g) || [];
};

const splitTokenToFit = (
  ctx: CanvasRenderingContext2D,
  token: string,
  maxWidth: number,
) => {
  if (ctx.measureText(token).width <= maxWidth) return [token];
  const chunks: string[] = [];
  let current = "";
  for (const character of Array.from(token)) {
    const candidate = current + character;
    if (current && ctx.measureText(candidate).width > maxWidth) {
      chunks.push(current);
      current = character;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
};

const wrapText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
) => {
  const tokens = segmentText(text.trim()).flatMap((token) =>
    splitTokenToFit(ctx, token, maxWidth),
  );
  const lines: string[] = [];
  let line = "";

  for (const token of tokens) {
    const candidate = line + token;
    if (!line || ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
      continue;
    }
    lines.push(line.trim());
    line = token.trimStart();
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
};

const getFontStyle = (bubble: TextBubble) => {
  if (isSfx(bubble.type)) return { style: "italic", weight: "800" };
  if (bubble.type === "label") return { style: "normal", weight: "600" };
  return { style: "normal", weight: "700" };
};

const fitText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  box: RefinedBubbleRegion["box"],
  bubble: TextBubble,
  maxFontSize: number,
  minFontSize: number,
) => {
  const horizontalPadding = box.width * (isSfx(bubble.type) ? 0.04 : 0.08);
  const verticalPadding = box.height * 0.08;
  const targetWidth = Math.max(1, box.width - horizontalPadding * 2);
  const targetHeight = Math.max(1, box.height - verticalPadding * 2);
  const font = getFontStyle(bubble);
  let low = Math.min(minFontSize, maxFontSize);
  let high = Math.max(minFontSize, maxFontSize);
  let best = {
    fontSize: low,
    lines: [] as string[],
    lineHeight: low * 1.12,
  };

  for (let iteration = 0; iteration < 12; iteration += 1) {
    const fontSize = (low + high) / 2;
    ctx.font = `${font.style} ${font.weight} ${fontSize}px Inter, Arial, sans-serif`;
    const lines = wrapText(ctx, text, targetWidth);
    const lineHeight = fontSize * (isSfx(bubble.type) ? 1.04 : 1.12);
    const widest = lines.reduce(
      (current, line) => Math.max(current, ctx.measureText(line).width),
      0,
    );
    const fits =
      lines.length > 0 &&
      lines.length * lineHeight <= targetHeight &&
      widest <= targetWidth;

    if (fits) {
      best = { fontSize, lines, lineHeight };
      low = fontSize;
    } else {
      high = fontSize;
    }
  }

  if (best.lines.length === 0) {
    ctx.font = `${font.style} ${font.weight} ${minFontSize}px Inter, Arial, sans-serif`;
    best = {
      fontSize: minFontSize,
      lines: wrapText(ctx, text, targetWidth),
      lineHeight: minFontSize * 1.08,
    };
  }

  return { ...best, font };
};

export const createTranslatedImageBlob = (
  originalUrl: string,
  bubbles: TextBubble[],
  settings: TranslationSettings,
): Promise<RenderedTranslation> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Could not get canvas context"));

      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const layouts = bubbles.map((bubble) => {
        const refined = settings.refineBubbles
          ? refineBubbleRegion(
              img,
              bubble,
              canvas.width,
              canvas.height,
            )
          : null;
        const modelBox = getModelPixelBox(bubble, canvas.width, canvas.height);
        const baseBuffer = isSfx(bubble.type) ? 0.025 : 0.015;
        const bufferX = modelBox.width * baseBuffer;
        const bufferY = modelBox.height * baseBuffer;
        const renderBox = refined?.box || {
          left: Math.max(0, modelBox.left - bufferX),
          top: Math.max(0, modelBox.top - bufferY),
          width: Math.min(
            canvas.width - modelBox.left + bufferX,
            modelBox.width + bufferX * 2,
          ),
          height: Math.min(
            canvas.height - modelBox.top + bufferY,
            modelBox.height + bufferY * 2,
          ),
        };

        return { bubble, refined, renderBox };
      });

      // Clear every source text region first. This prevents a later overlapping
      // bubble background from painting over text that was already typeset.
      for (const { bubble, refined, renderBox } of layouts) {
        if (settings.backgroundColor !== "transparent") {
          if (refined) {
            drawRefinedBackground(ctx, refined, settings.backgroundColor);
          } else {
            drawRoundedRect(
              ctx,
              renderBox,
              settings.backgroundColor,
              isSfx(bubble.type) ? 0.12 : 0.25,
            );
          }
        }
      }

      const renderedBubbles = layouts.map(({ bubble, refined, renderBox }) => {
        const resolutionScale = Math.max(0.65, canvas.width / 1000);
        const maxFontSize = Math.max(8, settings.fontSize * resolutionScale);
        const minFontSize = Math.max(7, 9 * resolutionScale);
        const fitted = fitText(
          ctx,
          bubble.translated_text,
          renderBox,
          bubble,
          maxFontSize,
          minFontSize,
        );

        ctx.fillStyle = settings.fontColor;
        ctx.strokeStyle = settings.strokeColor;
        ctx.lineWidth = Math.max(1.2, fitted.fontSize / 8);
        ctx.lineJoin = "round";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `${fitted.font.style} ${fitted.font.weight} ${fitted.fontSize}px Inter, Arial, sans-serif`;

        const totalHeight = fitted.lines.length * fitted.lineHeight;
        let y =
          renderBox.top +
          renderBox.height / 2 -
          totalHeight / 2 +
          fitted.lineHeight / 2;
        for (const line of fitted.lines) {
          if (settings.strokeColor !== "transparent") {
            ctx.strokeText(line, renderBox.left + renderBox.width / 2, y);
          }
          ctx.fillText(line, renderBox.left + renderBox.width / 2, y);
          y += fitted.lineHeight;
        }

        return {
          ...bubble,
          render_box_2d: normalizePixelBox(
            renderBox,
            canvas.width,
            canvas.height,
          ),
          refinement: refined ? "local-mask" : "model-box",
        } satisfies TextBubble;
      });

      canvas.toBlob(
        (blob) => {
          if (blob) resolve({ blob, bubbles: renderedBubbles });
          else reject(new Error("Canvas to Blob failed"));
        },
        "image/jpeg",
        0.92,
      );
    };
    img.onerror = () => reject(new Error("Original image could not be loaded"));
    img.src = resolveImageUrl(originalUrl);
  });
};
