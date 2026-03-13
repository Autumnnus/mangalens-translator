interface PDFPage {
  getViewport: (options: { scale: number }) => {
    width: number;
    height: number;
  };
  render: (options: {
    canvasContext: CanvasRenderingContext2D | null;
    viewport: unknown;
  }) => { promise: Promise<void> };
}

interface PDFDocument {
  numPages: number;
  getPage: (index: number) => Promise<PDFPage>;
}

declare const pdfjsLib: {
  getDocument: (options: { data: ArrayBuffer }) => {
    promise: Promise<PDFDocument>;
  };
};

interface JsPDF {
  internal: {
    pageSize: { getWidth: () => number; getHeight: () => number };
  };
  addPage: () => void;
  addImage: (
    url: string,
    format: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ) => void;
  save: (filename: string) => void;
}

export const extractImagesFromPdf = async (
  file: File,
): Promise<{ url: string; name: string }[]> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const images: { url: string; name: string }[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({ canvasContext: context, viewport }).promise;
    images.push({
      url: canvas.toDataURL("image/jpeg", 0.82),
      name: `${file.name.replace(".pdf", "")}_page_${i}.jpg`,
    });
  }
  return images;
};

export const bundleToPdf = async (imageUrls: string[], filename: string) => {
  const { jsPDF } = (window as unknown as { jspdf: { jsPDF: new () => JsPDF } })
    .jspdf;
  const pdf = new jsPDF();

  for (let i = 0; i < imageUrls.length; i++) {
    const url = imageUrls[i];

    const img = new Image();
    img.src = url;
    await new Promise((resolve) => {
      img.onload = resolve;
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (img.height * pdfWidth) / img.width;

    if (i > 0) pdf.addPage();
    pdf.addImage(url, "JPEG", 0, 0, pdfWidth, pdfHeight);
  }

  pdf.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
};
