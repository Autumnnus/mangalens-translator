
import { TextBubble, TranslationSettings } from "../types";

export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = error => reject(error);
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
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject("Could not get canvas context");

      canvas.width = img.width;
      canvas.height = img.height;

      ctx.drawImage(img, 0, 0);

      bubbles.forEach(bubble => {
        const [ymin, xmin, ymax, xmax] = bubble.box_2d;
        
        const left = (xmin / 1000) * canvas.width;
        const top = (ymin / 1000) * canvas.height;
        const width = ((xmax - xmin) / 1000) * canvas.width;
        const height = ((ymax - ymin) / 1000) * canvas.height;

        // 1. Precise Background Clearing (Matches detected bubble geometry)
        if (settings.backgroundColor !== 'transparent') {
          ctx.fillStyle = settings.backgroundColor;
          // Clear slightly larger than coordinates to handle antialiasing issues in detection
          ctx.fillRect(left - 1, top - 1, width + 2, height + 2);
        }

        const isItalic = bubble.type === 'environmental';
        const fontStyle = isItalic ? 'italic' : '';
        const fontWeight = isItalic ? '500' : 'bold';

        // 2. Dynamic Font Scaling Logic
        let currentFontSize = settings.fontSize;
        const minFontSize = 8;
        const padding = width * 0.1; // 10% horizontal padding inside box
        const targetWidth = width - (padding * 2);
        
        let lines: string[] = [];
        let totalHeight = 0;

        // Decrease font size until text fits both width and height of the box
        while (currentFontSize >= minFontSize) {
          ctx.font = `${fontStyle} ${fontWeight} ${currentFontSize}px 'Inter', sans-serif`;
          lines = wrapText(ctx, bubble.translated_text, targetWidth);
          const lineHeight = currentFontSize * 1.15; // Tighter line spacing for manga feel
          totalHeight = lines.length * lineHeight;

          if (totalHeight <= height - 4) { // 4px vertical margin
            break;
          }
          currentFontSize -= 1;
        }

        // Final rendering with calculated currentFontSize
        ctx.fillStyle = settings.fontColor;
        ctx.strokeStyle = settings.strokeColor;
        ctx.lineWidth = Math.max(1.5, currentFontSize / 6); 
        ctx.lineJoin = 'round';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `${fontStyle} ${fontWeight} ${currentFontSize}px 'Inter', sans-serif`;
        
        const lineHeight = currentFontSize * 1.15;
        let startY = top + (height / 2) - (totalHeight / 2) + (lineHeight / 2);
        
        lines.forEach(line => {
          if (settings.strokeColor !== 'transparent') {
            ctx.strokeText(line, left + (width / 2), startY);
          }
          ctx.fillText(line, left + (width / 2), startY);
          startY += lineHeight;
        });
      });

      resolve(canvas.toDataURL('image/jpeg', 0.9));
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
