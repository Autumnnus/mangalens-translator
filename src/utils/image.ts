import { TextBubble, TranslationSettings } from "../types";
import { resolveImageUrl } from "./url";

export const createTranslatedImageBlob = (
  originalUrl: string,
  bubbles: TextBubble[],
  settings: TranslationSettings
): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject("Could not get canvas context");

      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      bubbles.forEach((bubble) => {
        const [ymin, xmin, ymax, xmax] = bubble.box_2d;
        const bufferX = (xmax - xmin) * 0.015;
        const bufferY = (ymax - ymin) * 0.015;

        const left = ((xmin - bufferX) / 1000) * canvas.width;
        const top = ((ymin - bufferY) / 1000) * canvas.height;
        const width = ((xmax - xmin + bufferX * 2) / 1000) * canvas.width;
        const height = ((ymax - ymin + bufferY * 2) / 1000) * canvas.height;

        if (settings.backgroundColor !== "transparent") {
          ctx.fillStyle = settings.backgroundColor;
          const radius = Math.min(width, height) * 0.25;
          ctx.beginPath();
          ctx.moveTo(left + radius, top);
          ctx.lineTo(left + width - radius, top);
          ctx.quadraticCurveTo(left + width, top, left + width, top + radius);
          ctx.lineTo(left + width, top + height - radius);
          ctx.quadraticCurveTo(
            left + width,
            top + height,
            left + width - radius,
            top + height
          );
          ctx.lineTo(left + radius, top + height);
          ctx.quadraticCurveTo(left, top + height, left, top + height - radius);
          ctx.lineTo(left, top + radius);
          ctx.quadraticCurveTo(left, top, left + radius, top);
          ctx.closePath();
          ctx.fill();
        }

        const isItalic = bubble.type === "environmental";
        const fontStyle = isItalic ? "italic" : "";
        const fontWeight = isItalic ? "500" : "bold";

        let currentFontSize = settings.fontSize;
        const minFontSize = 10;
        const paddingHoriz = width * 0.07;
        const paddingVert = height * 0.07;
        const targetWidth = width - paddingHoriz * 2;

        let lines: string[] = [];
        let totalHeight = 0;

        while (currentFontSize > minFontSize) {
          ctx.font = `${fontStyle} ${fontWeight} ${currentFontSize}px 'Inter', sans-serif`;
          lines = wrapText(ctx, bubble.translated_text, targetWidth);
          const lineHeight = currentFontSize * 1.12;
          totalHeight = lines.length * lineHeight;
          const maxLineWidth = lines.reduce(
            (max, line) => Math.max(max, ctx.measureText(line).width),
            0
          );
          if (
            totalHeight <= height - paddingVert * 2 &&
            maxLineWidth <= targetWidth
          )
            break;
          currentFontSize -= 0.5;
        }

        ctx.fillStyle = settings.fontColor;
        ctx.strokeStyle = settings.strokeColor;
        ctx.lineWidth = Math.max(1.2, currentFontSize / 8);
        ctx.lineJoin = "round";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `${fontStyle} ${fontWeight} ${currentFontSize}px 'Inter', sans-serif`;

        const lineHeight = currentFontSize * 1.12;
        let startY = top + height / 2 - totalHeight / 2 + lineHeight / 2;

        lines.forEach((line) => {
          if (settings.strokeColor !== "transparent")
            ctx.strokeText(line, left + width / 2, startY);
          ctx.fillText(line, left + width / 2, startY);
          startY += lineHeight;
        });
      });

      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject("Canvas to Blob failed");
        },
        "image/jpeg",
        0.9
      );
    };
    img.onerror = (err) => reject(err);
    img.src = resolveImageUrl(originalUrl);
  });
};

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = words[0] || "";

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const testLine = currentLine + " " + word;
    const metrics = ctx.measureText(testLine);

    if (metrics.width < maxWidth) {
      currentLine = testLine;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}
