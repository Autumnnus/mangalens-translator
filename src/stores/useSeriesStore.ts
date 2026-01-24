import { create } from "zustand";
import {
  createCategoryAction,
  deleteCategoryAction,
  fetchCategoriesAction,
  updateCategoryAction,
} from "../actions/categories";
import {
  addImageAction,
  deleteImageAction,
  reorderImagesAction,
  updateImageAction,
} from "../actions/images";
import {
  createSeriesAction,
  deleteSeriesAction,
  fetchSeriesAction,
  fetchSeriesImagesAction,
  updateSeriesAction,
} from "../actions/series";
import {
  Category,
  ImageUpdateInput,
  ProcessedImage,
  Series,
  SeriesInput,
  TextBubble,
  UsageMetadata,
} from "../types";

interface SeriesState {
  series: Series[];
  activeSeriesId: string | null;
  categories: Category[];
  isLoading: boolean;
  isImagesLoading: boolean;
  error: string | null;

  // Pagination
  page: number;
  pageSize: number;
  total: number;
  setPage: (page: number) => void;

  // Sync Actions
  fetchSeries: () => Promise<void>;
  fetchCategories: () => Promise<void>;
  fetchImages: (seriesId: string) => Promise<void>;

  // Actions
  setSeries: (series: Series[] | ((prev: Series[]) => Series[])) => void;
  addSeries: (series: Series) => Promise<void>;
  updateSeries: (id: string, updates: Partial<Series>) => Promise<void>;
  deleteSeries: (id: string) => Promise<void>;
  setActiveSeriesId: (id: string | null) => void;

  // Image Actions
  setImages: (
    seriesId: string,
    action: ProcessedImage[] | ((prev: ProcessedImage[]) => ProcessedImage[]),
  ) => void;
  addImageToSeries: (seriesId: string, image: ProcessedImage) => Promise<void>;
  removeImageFromSeries: (seriesId: string, imageId: string) => Promise<void>;
  updateImageInSeries: (
    seriesId: string,
    imageId: string,
    updates: Partial<ProcessedImage>,
  ) => Promise<void>;

  saveTranslatedImage: (
    seriesId: string,
    imageId: string,
    blob: Blob,
    fileName: string,
    meta?: { bubbles: TextBubble[]; usage: UsageMetadata; cost: number },
  ) => Promise<void>;

  // Ordering Actions
  reorderSeries: (orderedSeriesIds: string[]) => Promise<void>;
  reorderImages: (seriesId: string, orderedImageIds: string[]) => Promise<void>;

  // Category Actions
  setCategories: (categories: Category[]) => void;
  addCategory: (
    name: string,
    parentId?: string,
    color?: string,
  ) => Promise<void>;
  updateCategory: (
    id: string,
    name: string,
    parentId?: string | null,
    color?: string,
  ) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;

  // Hydration / Legacy
  rehydrateImages: () => Promise<void>;
}

export const useSeriesStore = create<SeriesState>((set, get) => ({
  series: [],
  activeSeriesId: null,
  categories: [],
  isLoading: false,
  isImagesLoading: false,
  error: null,

  // Pagination defaults
  page: 1,
  pageSize: 20,
  total: 0,

  setPage: (page) => {
    set({ page });
    get().fetchSeries();
  },

  fetchCategories: async () => {
    try {
      const categoriesData = await fetchCategoriesAction();
      const transformedCategories: Category[] = categoriesData.map((c) => ({
        id: c.id,
        name: c.name,
        parentId: c.parentId,
        color: c.color || undefined,
      }));
      set({ categories: transformedCategories });
    } catch (err) {
      console.error("Fetch Categories Error", err);
    }
  },

  fetchSeries: async () => {
    set({ isLoading: true, error: null });
    try {
      await get().fetchCategories();
      const { items, total } = await fetchSeriesAction(
        undefined,
        get().page,
        get().pageSize,
      );

      const transformedSeries: Series[] = items.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description || "",
        category: "Uncategorized",
        categoryId: s.categoryId || undefined,
        tags: s.tags || [],
        createdAt: new Date(s.createdAt || Date.now()).getTime(),
        updatedAt: new Date(s.updatedAt || Date.now()).getTime(),
        sequenceNumber: s.sequenceNumber || 0,
        author: s.author || undefined,
        group: s.groupName || undefined,
        originalTitle: s.originalTitle || undefined,
        imageCount: Number(s.imageCount) || 0,
        completedCount: Number(s.completedCount) || 0,
        previewImages: s.previewImages || [],
        images: [], // Images are now lazy loaded
      }));

      set({
        series: transformedSeries,
        isLoading: false,
        total,
      });

      if (transformedSeries.length > 0 && !get().activeSeriesId) {
        get().setActiveSeriesId(transformedSeries[0].id);
      }
    } catch (err) {
      console.error("Fetch Series Error:", err);
      const message = err instanceof Error ? err.message : "Fetch failed";
      set({ error: message, isLoading: false });
    }
  },

  fetchImages: async (id: string) => {
    const sIndex = get().series.findIndex((s) => s.id === id);
    if (sIndex === -1) return;

    set({ isImagesLoading: true });
    try {
      const images = await fetchSeriesImagesAction(id);
      const transformedImages: ProcessedImage[] = images.map((img) => ({
        id: img.id,
        fileName: img.fileName,
        originalUrl: img.originalUrl,
        translatedUrl: img.translatedUrl,
        status: img.status as ProcessedImage["status"],
        originalKey: img.originalKey,
        translatedKey: img.translatedKey || undefined,
        sequenceNumber: img.sequenceNumber || 0,
        bubbles: (img.bubbles as unknown as TextBubble[]) || [],
        usage: (img.usage as unknown as UsageMetadata) || undefined,
        cost: img.cost || 0,
      }));

      set((state) => {
        const newSeries = [...state.series];
        newSeries[sIndex] = {
          ...newSeries[sIndex],
          images: transformedImages,
        };
        return { series: newSeries, isImagesLoading: false };
      });
    } catch (err) {
      console.error("Fetch Images Error:", err);
      set({ isImagesLoading: false });
    }
  },

  setSeries: (action) =>
    set((state) => ({
      series: typeof action === "function" ? action(state.series) : action,
    })),

  addSeries: async (newSeries) => {
    set((state) => ({
      series: [newSeries, ...state.series],
      activeSeriesId: newSeries.id,
    }));

    try {
      await createSeriesAction({
        name: newSeries.name,
        description: newSeries.description,
        categoryId: newSeries.categoryId,
        tags: newSeries.tags,
        author: newSeries.author,
        groupName: newSeries.group,
        originalTitle: newSeries.originalTitle,
        sequenceNumber: newSeries.sequenceNumber,
      });
      get().fetchSeries();
    } catch (err) {
      console.error(err);
    }
  },

  updateSeries: async (id, updates) => {
    set((state) => ({
      series: state.series.map((s) =>
        s.id === id ? { ...s, ...updates, updatedAt: Date.now() } : s,
      ),
    }));

    try {
      const dbUpdates: Partial<SeriesInput> = {};
      if (updates.name !== undefined) dbUpdates.name = updates.name;
      if (updates.description !== undefined)
        dbUpdates.description = updates.description;
      if (updates.categoryId !== undefined)
        dbUpdates.categoryId = updates.categoryId;
      if (updates.author !== undefined) dbUpdates.author = updates.author;
      if (updates.group !== undefined) dbUpdates.groupName = updates.group;
      if (updates.originalTitle !== undefined)
        dbUpdates.originalTitle = updates.originalTitle;
      if (updates.sequenceNumber !== undefined)
        dbUpdates.sequenceNumber = updates.sequenceNumber;

      await updateSeriesAction(id, dbUpdates);
    } catch (err) {
      console.error(err);
    }
  },

  deleteSeries: async (id) => {
    const seriesToDelete = get().series.find((s) => s.id === id);
    if (!seriesToDelete) return;

    set((state) => {
      const newSeries = state.series.filter((s) => s.id !== id);
      const nextActiveId =
        state.activeSeriesId === id
          ? newSeries.length > 0
            ? newSeries[0].id
            : null
          : state.activeSeriesId;
      return { series: newSeries, activeSeriesId: nextActiveId };
    });

    try {
      const keysToDelete = await deleteSeriesAction(id);
      if (keysToDelete && keysToDelete.length > 0) {
        await fetch("/api/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keys: keysToDelete }),
        });
      }
    } catch (err) {
      console.error("Delete Series error:", err);
    }
  },

  setActiveSeriesId: (id) => {
    set({ activeSeriesId: id });
    if (id) {
      get().fetchImages(id);
    }
  },

  setImages: (seriesId, action) => {
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
    });
  },

  addImageToSeries: async (seriesId, image) => {
    if (!seriesId || seriesId === "default") {
      console.error("Cannot add image: No series selected");
      return;
    }
    set((state) => ({
      series: state.series.map((s) =>
        s.id === seriesId ? { ...s, images: [...s.images, image] } : s,
      ),
    }));

    try {
      if (image.originalUrl.startsWith("blob:")) {
        const blob = await fetch(image.originalUrl).then((r) => r.blob());

        const res = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: image.fileName,
            contentType: blob.type,
            seriesId,
          }),
        });

        if (!res.ok) throw new Error("Failed to get upload URL");
        const { uploadUrl, key } = await res.json();

        await fetch(uploadUrl, {
          method: "PUT",
          body: blob,
          headers: { "Content-Type": blob.type },
        });

        await addImageAction(seriesId, {
          fileName: image.fileName,
          originalKey: key,
          sequenceNumber: image.sequenceNumber,
        });

        get().fetchSeries();
      }
    } catch (err) {
      console.error("Upload failed", err);
    }
  },

  removeImageFromSeries: async (seriesId, imageId) => {
    set((state) => ({
      series: state.series.map((s) =>
        s.id === seriesId
          ? { ...s, images: s.images.filter((img) => img.id !== imageId) }
          : s,
      ),
    }));

    try {
      const keysToDelete = await deleteImageAction(imageId);
      if (keysToDelete && keysToDelete.length > 0) {
        await fetch("/api/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keys: keysToDelete }),
        });
      }
    } catch (err) {
      console.error("Remove Image Error:", err);
    }
  },

  updateImageInSeries: async (seriesId, imageId, updates) => {
    // Local update
    set((state) => ({
      series: state.series.map((s) =>
        s.id === seriesId
          ? {
              ...s,
              images: s.images
                .map((img) =>
                  img.id === imageId ? { ...img, ...updates } : img,
                )
                .sort(
                  (a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0),
                ),
            }
          : s,
      ),
    }));

    try {
      const dbUpdates: Partial<ImageUpdateInput> = { ...updates };
      await updateImageAction(imageId, dbUpdates);
    } catch (err) {
      console.error("Failed to update image:", err);
    }
  },

  saveTranslatedImage: async (seriesId, imageId, blob, fileName, meta) => {
    try {
      const activeSeries = get().series.find((s) => s.id === seriesId);
      const existingImage = activeSeries?.images.find(
        (img) => img.id === imageId,
      );

      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: `translated_${fileName}`,
          contentType: blob.type,
          seriesId,
          key: existingImage?.translatedKey,
        }),
      });

      if (!res.ok) throw new Error("Failed to get upload URL");
      const { uploadUrl, key } = await res.json();

      // 2. Upload to MinIO
      await fetch(uploadUrl, {
        method: "PUT",
        body: blob,
        headers: { "Content-Type": blob.type },
      });

      // 3. Update Database
      const updates: Partial<ProcessedImage> = {
        translatedKey: key,
        status: "completed" as ProcessedImage["status"],
        bubbles: meta?.bubbles || [],
        usage: meta?.usage || undefined,
        cost: meta?.cost || 0,
      };

      await get().updateImageInSeries(seriesId, imageId, updates);

      // 4. Refresh to get signed URLs
      await get().fetchSeries();
    } catch (err) {
      console.error("Save Translation Error:", err);
      get().updateImageInSeries(seriesId, imageId, { status: "error" });
    }
  },

  reorderSeries: async (_orderedIds) => {
    // Placeholder
  },
  reorderImages: async (seriesId, orderedIds) => {
    const state = get();
    const seriesIndex = state.series.findIndex((s) => s.id === seriesId);
    if (seriesIndex === -1) return;

    const currentImages = [...state.series[seriesIndex].images];
    const newImages = orderedIds
      .map((id) => currentImages.find((img) => img.id === id))
      .filter((img): img is ProcessedImage => !!img);

    // Assign new sequence numbers based on order
    const updatedImages = newImages.map((img, idx) => ({
      ...img,
      sequenceNumber: idx + 1,
    }));

    // Update local state
    const newSeries = [...state.series];
    newSeries[seriesIndex] = {
      ...newSeries[seriesIndex],
      images: updatedImages,
      updatedAt: Date.now(),
    };
    set({ series: newSeries });

    // Sync with DB
    try {
      await reorderImagesAction(orderedIds);
    } catch (err) {
      console.error("Reorder sync failed", err);
    }
  },

  setCategories: (categories) => set({ categories }),
  addCategory: async (name, parentId, color) => {
    const newCat = await createCategoryAction(name, parentId, color);
    if (newCat) get().fetchCategories();
  },
  updateCategory: async (id, name, parentId, color) => {
    await updateCategoryAction(id, name, parentId, color);
    get().fetchCategories();
  },
  deleteCategory: async (id) => {
    await deleteCategoryAction(id);
    get().fetchCategories();
  },

  rehydrateImages: async () => {
    await get().fetchSeries();
  },
}));
