import { TextBubble, TranslationSettings } from "../types";

export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = (error) => reject(error);
  });
};

export const createTranslatedImage = (
  originalUrl: string,
  bubbles: TextBubble[],
  settings: TranslationSettings
): Promise<string> => {
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

        // 0. Coordinate Buffer (Compensates for 0-1000 coordinate coarseness)
        const bufferX = (xmax - xmin) * 0.015; // 1.5% horizontal buffer
        const bufferY = (ymax - ymin) * 0.015; // 1.5% vertical buffer

        const left = ((xmin - bufferX) / 1000) * canvas.width;
        const top = ((ymin - bufferY) / 1000) * canvas.height;
        const width = ((xmax - xmin + bufferX * 2) / 1000) * canvas.width;
        const height = ((ymax - ymin + bufferY * 2) / 1000) * canvas.height;

        // 1. Precise Background Clearing (Matches detected bubble geometry)
        if (settings.backgroundColor !== "transparent") {
          ctx.fillStyle = settings.backgroundColor;

          // Use rounded rectangle to better fit manga bubbles
          const radius = Math.min(width, height) * 0.25; // Slightly more rounded

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

        // 2. Dynamic Font Scaling Logic
        let currentFontSize = settings.fontSize;
        const minFontSize = 10; // Increased min font size for readability
        const paddingHoriz = width * 0.07; // Reduced padding to 7%
        const paddingVert = height * 0.07;
        const targetWidth = width - paddingHoriz * 2;

        let lines: string[] = [];
        let totalHeight = 0;

        // Decrease font size until text fits both width and height or hits min
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
          ) {
            break;
          }
          currentFontSize -= 0.5; // Smoother scaling
        }

        // Final rendering
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
          if (settings.strokeColor !== "transparent") {
            ctx.strokeText(line, left + width / 2, startY);
          }
          ctx.fillText(line, left + width / 2, startY);
          startY += lineHeight;
        });
      });

      resolve(canvas.toDataURL("image/jpeg", 0.9));
    };
    img.onerror = (err) => {
      console.error("Image loading error in utility:", err);
      reject(err);
    };
    img.src = originalUrl;
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
