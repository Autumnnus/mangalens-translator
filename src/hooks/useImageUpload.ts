import { useState } from "react";
import { useSeriesStore } from "../stores/useSeriesStore";
import { ProcessedImage } from "../types";
import { extractImagesFromPdf } from "../utils/pdf";

import { useBatchAddImagesMutation } from "./useImageMutations";
import { useSeriesImagesQuery } from "./useSeriesQueries";

export const useImageUpload = () => {
  const [isUploading, setIsUploading] = useState(false);
  const activeSeriesId = useSeriesStore((state) => state.activeSeriesId);
  const { data: images } = useSeriesImagesQuery(activeSeriesId);
  const { mutateAsync: batchAddImagesMutation } = useBatchAddImagesMutation();

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || !activeSeriesId) return;

    setIsUploading(true);
    try {
      const uploadItems: {
        image: Partial<ProcessedImage>;
        file?: File | Blob;
      }[] = [];
      let nextSequenceNumber = images?.length || 0;

      for (const file of Array.from(files)) {
        if (file.type === "application/pdf") {
          try {
            const extracted = await extractImagesFromPdf(file);
            for (const img of extracted) {
              const res = await fetch(img.url);
              const blob = await res.blob();
              uploadItems.push({
                image: {
                  fileName: img.name,
                  status: "idle",
                  bubbles: [],
                  sequenceNumber: nextSequenceNumber++,
                },
                file: blob,
              });
            }
          } catch (err) {
            console.error("PDF extraction failed", err);
          }
        } else {
          uploadItems.push({
            image: {
              fileName: file.name,
              status: "idle",
              bubbles: [],
              sequenceNumber: nextSequenceNumber++,
            },
            file: file,
          });
        }
      }

      if (uploadItems.length > 0) {
        await batchAddImagesMutation({
          seriesId: activeSeriesId,
          items: uploadItems,
        });
      }
    } catch (error) {
      console.error("Upload failed", error);
    } finally {
      setIsUploading(false);
    }
  };

  return { handleFileUpload, isUploading };
};
