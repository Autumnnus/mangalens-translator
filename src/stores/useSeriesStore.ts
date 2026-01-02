import { create } from "zustand";
import { supabase } from "../lib/supabase";
import { ProcessedImage, Series } from "../types";

interface SeriesState {
  series: Series[];
  activeSeriesId: string;
  categories: string[];
  isLoading: boolean;
  error: string | null;

  // Sync Actions
  fetchSeries: () => Promise<void>;

  // Actions
  setSeries: (series: Series[] | ((prev: Series[]) => Series[])) => void;
  addSeries: (series: Series) => Promise<void>;
  updateSeries: (id: string, updates: Partial<Series>) => Promise<void>;
  deleteSeries: (id: string) => Promise<void>;
  setActiveSeriesId: (id: string) => void;

  // Image Actions
  setImages: (
    seriesId: string,
    action: ProcessedImage[] | ((prev: ProcessedImage[]) => ProcessedImage[])
  ) => void; // Keep for now, but internally should sync
  addImageToSeries: (seriesId: string, image: ProcessedImage) => Promise<void>;
  removeImageFromSeries: (seriesId: string, imageId: string) => Promise<void>;
  updateImageInSeries: (
    seriesId: string,
    imageId: string,
    updates: Partial<ProcessedImage>
  ) => Promise<void>;

  saveTranslatedImage: (
    seriesId: string,
    imageId: string,
    blob: Blob,
    fileName: string,
    meta?: any
  ) => Promise<void>;

  // Category Actions
  setCategories: (categories: string[]) => void;
  addCategory: (category: string) => void;
  updateCategoryName: (oldName: string, newName: string) => void;
  deleteCategory: (name: string) => void;

  // Hydration / Legacy
  rehydrateImages: () => Promise<void>; // Changed behavior: fetches from R2/Supabase
}

export const useSeriesStore = create<SeriesState>((set, get) => ({
  series: [],
  activeSeriesId: "default",
  categories: ["Manga", "Manhwa", "Webtoon", "Comic", "Uncategorized"],
  isLoading: false,
  error: null,

  fetchSeries: async () => {
    set({ isLoading: true, error: null });
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        set({ series: [], isLoading: false });
        return;
      }

      // Fetch Series & Images
      const { data: seriesData, error: seriesError } = await supabase
        .from("series")
        .select(
          `
          *,
          images (*)
        `
        )
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });

      if (seriesError) throw seriesError;

      // Transform data to local shape
      const transformedSeries: Series[] = seriesData.map((s: any) => ({
        id: s.id,
        name: s.name,
        description: s.description || "",
        category: s.category || "Uncategorized",
        tags: s.tags || [],
        createdAt: new Date(s.created_at).getTime(),
        updatedAt: new Date(s.updated_at).getTime(),
        images: (s.images || [])
          .map((img: any) => ({
            id: img.id,
            fileName: img.file_name,
            originalUrl:
              img.original_key /* We will need a way to resolve this to full URL if not public */,
            translatedUrl: img.translated_key,
            status: img.status || "idle",
            bubbles: [], // TODO: Store text bubbles in DB or separate JSON in R2? Use metadata? For now empty.
            // Note: Bubbles storage is missing in current DB schema plan.
            // Suggest storing bubbles in a JSON column in 'images' table or separate file in R2.
          }))
          .sort((a: any, b: any) => a.fileName.localeCompare(b.fileName)), // Basic sort
      }));

      // Prepend public URL or presigned logic
      // Assuming R2 public access or worker for now:
      const R2_DOMAIN = process.env.NEXT_PUBLIC_R2_DOMAIN || "";
      // If R2_DOMAIN is not set, we might need to rely on presigned URLs which expire.
      // But for simplicity in this migration, let's assume public.

      const fixedSeries = transformedSeries.map((s) => ({
        ...s,
        images: s.images.map((img) => ({
          ...img,
          originalUrl: img.originalUrl
            ? img.originalUrl.startsWith("http")
              ? img.originalUrl
              : `${R2_DOMAIN}/${img.originalUrl}`
            : "",
          translatedUrl: img.translatedUrl
            ? img.translatedUrl.startsWith("http")
              ? img.translatedUrl
              : `${R2_DOMAIN}/${img.translatedUrl}`
            : null,
        })),
      }));

      set({ series: fixedSeries, isLoading: false });
      if (fixedSeries.length > 0 && get().activeSeriesId === "default") {
        set({ activeSeriesId: fixedSeries[0].id });
      }
    } catch (err: any) {
      console.error("Fetch Series Error:", err);
      set({ error: err.message, isLoading: false });
    }
  },

  setSeries: (action) =>
    set((state) => ({
      series: typeof action === "function" ? action(state.series) : action,
    })),

  addSeries: async (newSeries) => {
    // Optimistic Update
    set((state) => ({
      series: [newSeries, ...state.series],
      activeSeriesId: newSeries.id,
    }));

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from("series")
        .insert({
          id: newSeries.id.length < 10 ? undefined : newSeries.id, // If it's a temp ID, let DB generate or use UUID if we generated valid UUID
          // Note: Our previous ID generation was Math.random().toString(). Supabase uses UUID.
          // We should probably rely on Supabase ID or generate UUIDs.
          // Let's assume we generated a compatible ID or let Supabase return it.
          name: newSeries.name,
          category: newSeries.category,
          description: newSeries.description,
          tags: newSeries.tags,
          user_id: user.id,
        })
        .select()
        .single();

      if (error) {
        console.error("Sync Add Series Error", error);
        // Revert or show error
      } else {
        // Update local ID if it was temp (not easy with optimistic, usually we generate UUID locally)
        get().fetchSeries(); // Refresh to get correct ID and state
      }
    } catch (err) {
      console.error(err);
    }
  },

  updateSeries: async (id, updates) => {
    set((state) => ({
      series: state.series.map((s) =>
        s.id === id ? { ...s, ...updates, updatedAt: Date.now() } : s
      ),
    }));

    try {
      if (id === "default") return;
      await supabase
        .from("series")
        .update({
          name: updates.name,
          category: updates.category,
          description: updates.description,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
    } catch (err) {
      console.error(err);
    }
  },

  deleteSeries: async (id) => {
    set((state) => {
      const newSeries = state.series.filter((s) => s.id !== id);
      let nextActiveId = state.activeSeriesId;
      if (state.activeSeriesId === id) {
        nextActiveId = newSeries.length > 0 ? newSeries[0].id : "default";
      }
      return { series: newSeries, activeSeriesId: nextActiveId };
    });

    try {
      await supabase.from("series").delete().eq("id", id);
    } catch (err) {
      console.error(err);
    }
  },

  setActiveSeriesId: (id) => set({ activeSeriesId: id }),

  setImages: (seriesId, action) => {
    // Allow local manipulation but warn or sync?
    // This is mostly used for bulk updates in current app.
    // We will perform naive update locally.
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
    // 1. Optimistic
    set((state) => ({
      series: state.series.map((s) =>
        s.id === seriesId ? { ...s, images: [...s.images, image] } : s
      ),
    }));

    // 2. Upload to R2 and Sync Supabase
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return; // Should be authenticated

      // Check if image.originalUrl is a Blob URL. If so, fetch it and upload.
      if (image.originalUrl.startsWith("blob:")) {
        const blob = await fetch(image.originalUrl).then((r) => r.blob());

        // Get Presigned URL
        const res = await fetch("/api/upload", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${
              (
                await supabase.auth.getSession()
              ).data.session?.access_token
            }`,
          },
          body: JSON.stringify({
            fileName: image.fileName,
            contentType: blob.type,
            seriesId,
          }),
        });

        if (!res.ok) throw new Error("Failed to get upload URL");
        const { uploadUrl, key, publicUrl } = await res.json();

        // Upload to R2
        await fetch(uploadUrl, {
          method: "PUT",
          body: blob,
          headers: { "Content-Type": blob.type },
        });

        // Insert into Supabase
        await supabase.from("images").insert({
          series_id: seriesId,
          file_name: image.fileName,
          original_key: key,
          status: "idle",
          // We could store bubbles metadata if we had a column.
        });

        // Update local URL to remote one
        set((state) => ({
          series: state.series.map((s) =>
            s.id === seriesId
              ? {
                  ...s,
                  images: s.images.map((img) =>
                    img.id === image.id
                      ? { ...img, originalUrl: publicUrl }
                      : img
                  ),
                }
              : s
          ),
        }));
      }
    } catch (err) {
      console.error("Upload failed", err);
      // Mark error state on image?
    }
  },

  removeImageFromSeries: async (seriesId, imageId) => {
    set((state) => ({
      series: state.series.map((s) =>
        s.id === seriesId
          ? { ...s, images: s.images.filter((img) => img.id !== imageId) }
          : s
      ),
    }));

    // We get the image to delete its key from R2?
    // Usually backend handles cleanup or we send Delete command.
    // For now delete from DB cascades.
    await supabase.from("images").delete().eq("id", imageId); // Assumes we use UUID matching DB, but local ID might be different
  },

  updateImageInSeries: async (seriesId, imageId, updates) => {
    set((state) => ({
      series: state.series.map((s) =>
        s.id === seriesId
          ? {
              ...s,
              images: s.images.map((img) =>
                img.id === imageId ? { ...img, ...updates } : img
              ),
            }
          : s
      ),
    }));

    // Basic update to DB (status, cost, usage, etc.)
    // If translatedUrl is passed here, it might be ignored if not handled via saveTranslatedImage,
    // or we assume it's already a remote URL.
    try {
      // We map generic updates to DB columns if possible.
      // For now mainly 'status'.
      const dbUpdates: any = {};
      if (updates.status) dbUpdates.status = updates.status;
      // bubbles? We don't have a column yet.
      if (Object.keys(dbUpdates).length > 0) {
        await supabase.from("images").update(dbUpdates).eq("id", imageId); // ID warning: verify generic ID vs UUID
      }
    } catch (err) {
      console.error(err);
    }
  },

  saveTranslatedImage: async (seriesId, imageId, blob, fileName, meta) => {
    // 1. Upload to R2
    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${
            (
              await supabase.auth.getSession()
            ).data.session?.access_token
          }`,
        },
        body: JSON.stringify({
          fileName: `translated_${fileName}`,
          contentType: blob.type,
          seriesId,
        }),
      });

      if (!res.ok) throw new Error("Failed to get upload URL");
      const { uploadUrl, key, publicUrl } = await res.json();

      await fetch(uploadUrl, {
        method: "PUT",
        body: blob,
        headers: { "Content-Type": blob.type },
      });

      // 2. Update DB
      await supabase
        .from("images")
        .update({
          translated_key: key,
          status: "completed",
          // bubbles: meta.bubbles // TODO: if we add json column
        })
        .eq("id", imageId);

      // 3. Update Local
      set((state) => ({
        series: state.series.map((s) =>
          s.id === seriesId
            ? {
                ...s,
                images: s.images.map((img) =>
                  img.id === imageId
                    ? {
                        ...img,
                        translatedUrl: publicUrl,
                        status: "completed",
                        bubbles: meta?.bubbles || img.bubbles,
                        usage: meta?.usage || img.usage,
                        cost: meta?.cost || img.cost,
                      }
                    : img
                ),
              }
            : s
        ),
      }));
    } catch (err) {
      console.error("Save translated image failed", err);
      get().updateImageInSeries(seriesId, imageId, { status: "error" });
    }
  },

  setCategories: (categories) => set({ categories }),
  addCategory: (category) =>
    set((state) => ({ categories: [...state.categories, category] })),
  updateCategoryName: (oldName, newName) =>
    set((state) => ({
      categories: state.categories.map((c) => (c === oldName ? newName : c)),
    })),
  deleteCategory: (name) =>
    set((s) => ({ categories: s.categories.filter((c) => c !== name) })),

  rehydrateImages: async () => {
    // Now just an alias for fetch
    await get().fetchSeries();
  },
}));
