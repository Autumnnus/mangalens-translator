import {
  createSeriesAction,
  deleteSeriesAction,
  fetchSeriesAction,
  fetchSeriesImagesAction,
  swapSeriesSequenceAction,
  updateSeriesAction,
} from "@/actions/series";
import { ProcessedImage, Series, SeriesInput } from "@/types";

export const seriesService = {
  getSeries: async (page = 1, pageSize = 20) => {
    const data = await fetchSeriesAction(undefined, page, pageSize);
    return {
      ...data,
      items: data.items.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description || "",
        categoryId: s.categoryId || undefined,
        category: "Uncategorized", // Fallback, will be matched by ID in UI if needed
        tags: s.tags || [],
        createdAt: s.createdAt ? new Date(s.createdAt).getTime() : Date.now(),
        updatedAt: s.updatedAt ? new Date(s.updatedAt).getTime() : Date.now(),
        sequenceNumber: s.sequenceNumber || 0,
        author: s.author || undefined,
        group: s.groupName || undefined,
        originalTitle: s.originalTitle || undefined,
        imageCount: Number(s.imageCount) || 0,
        completedCount: Number(s.completedCount) || 0,
        previewImages: s.previewImages || [],
        images: [], // Lazy loaded
      })) as Series[],
    };
  },

  getSeriesImages: async (seriesId: string): Promise<ProcessedImage[]> => {
    if (!seriesId) return [];
    const images = await fetchSeriesImagesAction(seriesId);
    return images.map((img) => ({
      id: img.id,
      fileName: img.fileName,
      originalUrl: img.originalUrl,
      translatedUrl: img.translatedUrl,
      status: img.status as ProcessedImage["status"],
      sequenceNumber: img.sequenceNumber || 0,
      bubbles: (img.bubbles as unknown as import("@/types").TextBubble[]) || [], // Jsonb to TextBubble[]
      usage:
        (img.usage as unknown as import("@/types").UsageMetadata) || undefined,
      cost: img.cost || 0,
    }));
  },

  createSeries: async (series: SeriesInput) => {
    return await createSeriesAction(series);
  },

  updateSeries: async (id: string, updates: Partial<SeriesInput>) => {
    return await updateSeriesAction(id, updates);
  },

  deleteSeries: async (id: string) => {
    return await deleteSeriesAction(id);
  },

  swapSeriesSequence: async (id1: string, id2: string) => {
    return await swapSeriesSequenceAction(id1, id2);
  },
};
