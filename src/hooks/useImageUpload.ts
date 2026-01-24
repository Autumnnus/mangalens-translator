import { useState } from "react";
import { useSeriesStore } from "../stores/useSeriesStore";
import { ProcessedImage } from "../types";
import { extractImagesFromPdf } from "../utils/pdf";

import { useAddImageMutation } from "./useImageMutations";
import { useSeriesImagesQuery } from "./useSeriesQueries";

export const useImageUpload = () => {
  const [isUploading, setIsUploading] = useState(false);
  const activeSeriesId = useSeriesStore((state) => state.activeSeriesId);
  const { data: images } = useSeriesImagesQuery(activeSeriesId);
  const { mutateAsync: addImageMutation } = useAddImageMutation();

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || !activeSeriesId) return;

    let nextSequenceNumber = images?.length || 0;

    setIsUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (file.type === "application/pdf") {
          try {
            const extracted = await extractImagesFromPdf(file);
            for (const img of extracted) {
              const res = await fetch(img.url);
              const blob = await res.blob();

              const newImage: Partial<ProcessedImage> = {
                fileName: img.name,
                status: "idle",
                bubbles: [],
                sequenceNumber: nextSequenceNumber++,
              };

              await addImageMutation({
                seriesId: activeSeriesId,
                image: newImage,
                file: blob,
              });
            }
          } catch (err) {
            console.error("PDF extraction failed", err);
          }
        } else {
          const newImage: Partial<ProcessedImage> = {
            fileName: file.name,
            status: "idle",
            bubbles: [],
            sequenceNumber: nextSequenceNumber++,
          };

          await addImageMutation({
            seriesId: activeSeriesId,
            image: newImage,
            file: file,
          });
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
