import { saveAs } from "file-saver";
import JSZip from "jszip";
import { useSeriesStore } from "../stores/useSeriesStore";

export const useProjectExport = () => {
  const { series, activeSeriesId } = useSeriesStore();
  const activeSeries = series.find((s) => s.id === activeSeriesId);

  const downloadAllAsZip = async () => {
    if (!activeSeries || activeSeries.images.length === 0) return;

    const zip = new JSZip();
    const folder = zip.folder(activeSeries.name.replace(/[^a-z0-9]/gi, "_"));
    if (!folder) return;

    // JSON Export
    const cleanedSeries = {
      ...activeSeries,
      images: activeSeries.images.map((img, idx) => {
        const paddedIndex = (idx + 1).toString().padStart(3, "0");
        const extension = img.fileName.split(".").pop() || "jpg";
        return {
          ...img,
          originalUrl: `${paddedIndex}_source.${extension}`,
          translatedUrl: img.translatedUrl
            ? `${paddedIndex}_translated.${extension}`
            : null,
        };
      }),
    };

    folder.file("series.json", JSON.stringify(cleanedSeries, null, 2));

    // Images Export
    for (let idx = 0; idx < activeSeries.images.length; idx++) {
      const img = activeSeries.images[idx];
      try {
        const extension = img.fileName.split(".").pop() || "jpg";
        const paddedIndex = (idx + 1).toString().padStart(3, "0");

        const sourceRes = await fetch(img.originalUrl);
        const sourceBlob = await sourceRes.blob();
        folder.file(`${paddedIndex}_source.${extension}`, sourceBlob);

        if (img.translatedUrl && img.translatedUrl !== img.originalUrl) {
          const translatedRes = await fetch(img.translatedUrl as string);
          const translatedBlob = await translatedRes.blob();
          folder.file(`${paddedIndex}_translated.${extension}`, translatedBlob);
        }
      } catch (e) {
        console.error(`Failed to add ${img.fileName} to ZIP:`, e);
      }
    }

    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, `${activeSeries.name}_export.zip`);
  };

  const downloadFullAccountZip = async () => {
    const zip = new JSZip();
    for (const s of series) {
      if (s.images.length === 0) continue;
      const folder = zip.folder(s.name.replace(/[^a-z0-9]/gi, "_"));
      if (!folder) continue;

      // Create a clean version of series for JSON export (without blob URLs)
      const cleanedSeries = {
        ...s,
        images: s.images.map((img, idx) => {
          const paddedIndex = (idx + 1).toString().padStart(3, "0");
          const extension = img.fileName.split(".").pop() || "jpg";
          return {
            ...img,
            // Store relative file paths instead of blob URLs
            originalUrl: `${paddedIndex}_source.${extension}`,
            translatedUrl: img.translatedUrl
              ? `${paddedIndex}_translated.${extension}`
              : null,
          };
        }),
      };

      folder.file("series.json", JSON.stringify(cleanedSeries, null, 2));

      for (let idx = 0; idx < s.images.length; idx++) {
        const img = s.images[idx];
        try {
          const extension = img.fileName.split(".").pop() || "jpg";
          const paddedIndex = (idx + 1).toString().padStart(3, "0");

          // Save Source
          const sourceRes = await fetch(img.originalUrl);
          const sourceBlob = await sourceRes.blob();
          folder.file(`${paddedIndex}_source.${extension}`, sourceBlob);

          // Save Translated if exists
          if (img.translatedUrl && img.translatedUrl !== img.originalUrl) {
            const translatedRes = await fetch(img.translatedUrl as string);
            const translatedBlob = await translatedRes.blob();
            folder.file(
              `${paddedIndex}_translated.${extension}`,
              translatedBlob
            );
          }
        } catch (e) {
          console.error(
            `Failed to add ${img.fileName} from ${s.name} to ZIP:`,
            e
          );
        }
      }
    }

    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, "mangalens_full_library_export.zip");
  };

  return { downloadAllAsZip, downloadFullAccountZip };
};
