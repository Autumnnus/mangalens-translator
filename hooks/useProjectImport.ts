import JSZip from "jszip";
import { useSeriesStore } from "../stores/useSeriesStore";
import { ProcessedImage, Series } from "../types";
import { imageDb } from "../utils/db";

export const useProjectImport = () => {
  const { setSeries, setActiveSeriesId } = useSeriesStore();

  const importLibrary = async (file: File) => {
    try {
      const zip = await JSZip.loadAsync(file);
      const newSeries: Series[] = [];

      // Detect if this is a full library export (has subfolders as series) or single series
      // Quick check: look for folders at root
      const rootEntries = Object.keys(zip.files).filter(
        (path) => !path.includes("/")
      );

      // We'll traverse all folders looking for "series.json"
      const seriesFolders = new Set<string>();

      zip.forEach((relativePath, zipEntry) => {
        if (relativePath.endsWith("series.json") && !zipEntry.dir) {
          // Extract folder path, e.g., "MySeries/series.json" -> "MySeries/"
          const folderPath = relativePath.replace("series.json", "");
          seriesFolders.add(folderPath);
        }
      });

      for (const folderPath of Array.from(seriesFolders)) {
        const jsonContent = await zip
          .file(folderPath + "series.json")
          ?.async("string");
        if (!jsonContent) continue;

        const seriesData = JSON.parse(jsonContent) as Series;

        const rehydratedImages: ProcessedImage[] = [];

        for (let i = 0; i < seriesData.images.length; i++) {
          const originalImg = seriesData.images[i];
          const extension = originalImg.fileName.split(".").pop() || "jpg";
          const paddedIndex = (i + 1).toString().padStart(3, "0");

          const sourcePath = `${folderPath}${paddedIndex}_source.${extension}`;
          const translatedPath = `${folderPath}${paddedIndex}_translated.${extension}`;

          let sourceBlobUrl = "";
          let translatedBlobUrl = null;

          const sourceFile = zip.file(sourcePath);
          if (sourceFile) {
            const blob = await sourceFile.async("blob");
            sourceBlobUrl = URL.createObjectURL(blob);
            await imageDb.saveImage(originalImg.id, "original", blob);
          } else {
            continue;
          }

          const translatedFile = zip.file(translatedPath);
          if (translatedFile) {
            const blob = await translatedFile.async("blob");
            translatedBlobUrl = URL.createObjectURL(blob);
            await imageDb.saveImage(originalImg.id, "translated", blob);
          }

          rehydratedImages.push({
            ...originalImg,
            originalUrl: sourceBlobUrl,
            translatedUrl: translatedBlobUrl,
            status: "completed",
          });
        }

        newSeries.push({
          ...seriesData,
          id: Math.random().toString(36).substring(2, 9), // Generate new ID to avoid collisions
          images: rehydratedImages,
          updatedAt: Date.now(),
        });
      }

      if (newSeries.length > 0) {
        setSeries((prev: Series[]) => [...prev, ...newSeries]);
        setActiveSeriesId(newSeries[0].id);
        alert(`Imported ${newSeries.length} series successfully!`);
      } else {
        alert("No valid series found in the ZIP archive.");
      }
    } catch (err) {
      console.error("Failed to import library:", err);
      alert("Failed to import library. See console for details.");
    }
  };

  return { importLibrary };
};
