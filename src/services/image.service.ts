import {
  addImageAction,
  addImagesAction,
  deleteImageAction,
  reorderImagesAction,
  updateImageAction,
} from "@/actions/images";
import { ImageUpdateInput, ProcessedImage } from "@/types";

export const imageService = {
  addImage: async (seriesId: string, image: Partial<ProcessedImage>) => {
    return await addImageAction(seriesId, image);
  },

  addImages: async (seriesId: string, items: ImageUpdateInput[]) => {
    return await addImagesAction(seriesId, items);
  },

  updateImage: async (imageId: string, updates: Partial<ProcessedImage>) => {
    return await updateImageAction(imageId, updates);
  },

  deleteImage: async (imageId: string) => {
    return await deleteImageAction(imageId);
  },

  reorderImages: async (imageIds: string[]) => {
    return await reorderImagesAction(imageIds);
  },

  setImageStatus: async ({
    seriesId,
    imageId,
    status,
  }: {
    seriesId: string;
    imageId: string;
    status: ProcessedImage["status"];
  }) => {
    const res = await fetch("/api/images/status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ seriesId, imageId, status }),
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error || "Failed to update image status");
    }
  },
};
