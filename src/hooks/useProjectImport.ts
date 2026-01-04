import JSZip from "jszip";
import { useSeriesStore } from "../stores/useSeriesStore";
import { Series } from "../types";
// import { imageDb } from "../utils/db"; // Removed

export const useProjectImport = () => {
  const { addSeries, addImageToSeries, setActiveSeriesId } = useSeriesStore();

  const importLibrary = async (file: File) => {
    try {
      const zip = await JSZip.loadAsync(file);

      // We'll traverse all folders looking for "series.json"
      const seriesFolders = new Set<string>();

      zip.forEach((relativePath, zipEntry) => {
        if (relativePath.endsWith("series.json") && !zipEntry.dir) {
          // Extract folder path, e.g., "MySeries/series.json" -> "MySeries/"
          const folderPath = relativePath.replace("series.json", "");
          seriesFolders.add(folderPath);
        }
      });

      let importedCount = 0;
      for (const seriesFolder of Array.from(seriesFolders)) {
        const jsonContent = await zip
          .file(seriesFolder + "series.json")
          ?.async("string");
        if (!jsonContent) continue;

        const seriesData = JSON.parse(jsonContent) as Series;

        // 1. Create Series
        const newSeriesId = crypto.randomUUID(); // Use UUID for new series
        const newSeries: Series = {
          ...seriesData,
          id: newSeriesId,
          images: [], // Start empty, add one by one
          updatedAt: Date.now(),
        };

        await addSeries(newSeries);
        setActiveSeriesId(newSeriesId);

        // 2. Upload Images
        for (let i = 0; i < seriesData.images.length; i++) {
          const originalImg = seriesData.images[i];
          const extension = originalImg.fileName.split(".").pop() || "jpg";
          const paddedIndex = (i + 1).toString().padStart(3, "0");
          const sourcePath = `${seriesFolder}${paddedIndex}_source.${extension}`;

          const sourceFile = zip.file(sourcePath);
          if (!sourceFile) continue;

          const blob = await sourceFile.async("blob");
          const blobUrl = URL.createObjectURL(blob);

          await addImageToSeries(newSeriesId, {
            ...originalImg,
            id: originalImg.id, // Try to keep ID or generate new? R2 key depends on time, but it's fine.
            originalUrl: blobUrl,
            translatedUrl: null, // Reset translation for now as we don't handle uploading translated BLOBs in addImageToSeries yet. TODO: Support it.
            status: "idle",
          });
        }
        importedCount++;
      }

      if (importedCount > 0) {
        alert(
          `Imported ${importedCount} series successfully! Images are uploading in background.`
        );
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
