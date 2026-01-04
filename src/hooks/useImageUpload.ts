import { useState } from "react";
import { useSeriesStore } from "../stores/useSeriesStore";
import { ProcessedImage } from "../types";
// import { imageDb } from "../utils/db"; // Removed
import { extractImagesFromPdf } from "../utils/pdf";

export const useImageUpload = () => {
  const [isUploading, setIsUploading] = useState(false);
  const { addImageToSeries, activeSeriesId, series } = useSeriesStore();
  const activeSeries = series.find((s) => s.id === activeSeriesId);
  let nextSequenceNumber = activeSeries?.images.length || 0;

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || !activeSeriesId) return;

    setIsUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (file.type === "application/pdf") {
          try {
            const extracted = await extractImagesFromPdf(file);
            for (const img of extracted) {
              const id = Math.random().toString(36).substring(2, 11);
              const res = await fetch(img.url);
              const blob = await res.blob();

              // await imageDb.saveImage(id, "original", blob); // Removed

              const newImage: ProcessedImage = {
                id,
                fileName: img.name,
                originalUrl: URL.createObjectURL(blob),
                translatedUrl: null,
                status: "idle",
                bubbles: [],
                sequenceNumber: nextSequenceNumber++,
              };

              addImageToSeries(activeSeriesId, newImage);
            }
          } catch (err) {
            console.error("PDF extraction failed", err);
          }
        } else {
          const id = Math.random().toString(36).substring(2, 11);
          // await imageDb.saveImage(id, "original", file); // Removed

          const newImage: ProcessedImage = {
            id,
            fileName: file.name,
            originalUrl: URL.createObjectURL(file),
            translatedUrl: null,
            status: "idle",
            bubbles: [],
            sequenceNumber: nextSequenceNumber++,
          };

          addImageToSeries(activeSeriesId, newImage);
        }
      }
    } catch (error) {
      console.error("Upload failed", error);
    } finally {
      setIsUploading(false);
    }
  };

  return { handleFileUpload, isUploading };
};
