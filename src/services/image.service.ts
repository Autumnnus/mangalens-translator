import {
  addImageAction,
  deleteImageAction,
  reorderImagesAction,
  updateImageAction,
} from "@/actions/images";
import { ProcessedImage } from "@/types";

export const imageService = {
  addImage: async (seriesId: string, image: Partial<ProcessedImage>) => {
    return await addImageAction(seriesId, image);
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
};
