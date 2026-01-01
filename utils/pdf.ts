declare const pdfjsLib: any;

export const extractImagesFromPdf = async (
  file: File
): Promise<{ url: string; name: string }[]> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const images: { url: string; name: string }[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({ canvasContext: context, viewport }).promise;
    images.push({
      url: canvas.toDataURL("image/jpeg", 0.9),
      name: `${file.name.replace(".pdf", "")}_page_${i}.jpg`,
    });
  }
  return images;
};

export const bundleToPdf = async (imageUrls: string[], filename: string) => {
  const { jsPDF } = (window as any).jspdf;
  const pdf = new jsPDF();

  for (let i = 0; i < imageUrls.length; i++) {
    const url = imageUrls[i];

    // Create an image to get dimensions
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
