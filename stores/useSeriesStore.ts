import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ProcessedImage, Series } from "../types";
import { imageDb } from "../utils/db";

interface SeriesState {
  series: Series[];
  activeSeriesId: string;
  categories: string[];

  // Actions
  setSeries: (series: Series[] | ((prev: Series[]) => Series[])) => void;
  addSeries: (series: Series) => void;
  updateSeries: (id: string, updates: Partial<Series>) => void;
  deleteSeries: (id: string) => void;
  setActiveSeriesId: (id: string) => void;

  // Image Actions
  setImages: (
    seriesId: string,
    images: ProcessedImage[] | ((prev: ProcessedImage[]) => ProcessedImage[])
  ) => void;
  addImageToSeries: (seriesId: string, image: ProcessedImage) => void;
  removeImageFromSeries: (seriesId: string, imageId: string) => void;
  updateImageInSeries: (
    seriesId: string,
    imageId: string,
    updates: Partial<ProcessedImage>
  ) => void;

  // Category Actions
  setCategories: (categories: string[]) => void;
  addCategory: (category: string) => void;
  updateCategoryName: (oldName: string, newName: string) => void;
  deleteCategory: (name: string) => void;

  // Hydration
  rehydrateImages: () => Promise<void>;
}

export const useSeriesStore = create<SeriesState>()(
  persist(
    (set, get) => ({
      series: [
        {
          id: "default",
          name: "Untitled Project",
          description: "Default collection",
          images: [],
          category: "Uncategorized",
          tags: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      activeSeriesId: "default",
      categories: ["Manga", "Manhwa", "Webtoon", "Comic", "Uncategorized"],

      setSeries: (action) =>
        set((state) => ({
          series: typeof action === "function" ? action(state.series) : action,
        })),

      addSeries: (newSeries) =>
        set((state) => ({
          series: [...state.series, newSeries],
          activeSeriesId: newSeries.id,
        })),

      updateSeries: (id, updates) =>
        set((state) => ({
          series: state.series.map((s) =>
            s.id === id ? { ...s, ...updates, updatedAt: Date.now() } : s
          ),
        })),

      deleteSeries: (id) =>
        set((state) => {
          const newSeries = state.series.filter((s) => s.id !== id);
          // If we deleted the active series, switch to the first available or minimal default
          let nextActiveId = state.activeSeriesId;
          if (state.activeSeriesId === id) {
            nextActiveId = newSeries.length > 0 ? newSeries[0].id : "default";
            // If completely empty, we might want to recreate default,
            // but let's assume app logic handles "no series" elegantly or we ensure at least one.
          }
          return { series: newSeries, activeSeriesId: nextActiveId };
        }),

      setActiveSeriesId: (id) => set({ activeSeriesId: id }),

      setImages: (seriesId, action) =>
        set((state) => {
          const seriesIndex = state.series.findIndex((s) => s.id === seriesId);
          if (seriesIndex === -1) return {};

          const currentImages = state.series[seriesIndex].images;
          const newImages =
            typeof action === "function" ? action(currentImages) : action;

          const newSeries = [...state.series];
          newSeries[seriesIndex] = {
            ...newSeries[seriesIndex],
            images: newImages,
            updatedAt: Date.now(),
          };

          return { series: newSeries };
        }),

      addImageToSeries: (seriesId, image) =>
        set((state) => {
          return {
            series: state.series.map((s) =>
              s.id === seriesId
                ? { ...s, images: [...s.images, image], updatedAt: Date.now() }
                : s
            ),
          };
        }),

      removeImageFromSeries: (seriesId, imageId) =>
        set((state) => ({
          series: state.series.map((s) =>
            s.id === seriesId
              ? {
                  ...s,
                  images: s.images.filter((img) => img.id !== imageId),
                  updatedAt: Date.now(),
                }
              : s
          ),
        })),

      updateImageInSeries: (seriesId, imageId, updates) =>
        set((state) => ({
          series: state.series.map((s) =>
            s.id === seriesId
              ? {
                  ...s,
                  images: s.images.map((img) =>
                    img.id === imageId ? { ...img, ...updates } : img
                  ),
                  updatedAt: Date.now(),
                }
              : s
          ),
        })),

      setCategories: (categories) => set({ categories }),

      addCategory: (category) =>
        set((state) => ({ categories: [...state.categories, category] })),

      updateCategoryName: (oldName, newName) =>
        set((state) => ({
          categories: state.categories.map((c) =>
            c === oldName ? newName : c
          ),
          series: state.series.map((s) =>
            s.category === oldName ? { ...s, category: newName } : s
          ),
        })),

      deleteCategory: (name) =>
        set((state) => ({
          categories: state.categories.filter((c) => c !== name),
          series: state.series.map((s) =>
            s.category === name ? { ...s, category: "Uncategorized" } : s
          ),
        })),

      rehydrateImages: async () => {
        const state = get();
        let changed = false;

        const newSeries = await Promise.all(
          state.series.map(async (s) => {
            const newImages = await Promise.all(
              s.images.map(async (img) => {
                let updatedImg = { ...img };
                let imgChanged = false;

                // Logic from App.tsx rehydrate
                const needsOriginal = img.originalUrl?.startsWith("blob:");
                const needsTranslated = img.translatedUrl?.startsWith("blob:");

                if (needsOriginal || !img.originalUrl) {
                  const blob = await imageDb.getImage(img.id, "original");
                  if (blob) {
                    updatedImg.originalUrl = URL.createObjectURL(blob);
                    imgChanged = true;
                  }
                }

                if (needsTranslated) {
                  const blob = await imageDb.getImage(img.id, "translated");
                  if (blob) {
                    updatedImg.translatedUrl = URL.createObjectURL(blob);
                    imgChanged = true;
                  }
                }

                if (imgChanged) changed = true;
                return updatedImg;
              })
            );
            return { ...s, images: newImages };
          })
        );

        if (changed) {
          set({ series: newSeries });
        }
      },
    }),
    {
      name: "mangalens_series_store",
      partialize: (state) => ({
        series: state.series,
        activeSeriesId: state.activeSeriesId,
        categories: state.categories,
      }),
    }
  )
);
