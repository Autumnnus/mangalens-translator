/* eslint-disable @typescript-eslint/no-explicit-any */
import { create } from "zustand";
import { supabase } from "../lib/supabase";
import { ProcessedImage, Series } from "../types";
import { resolveImageUrl } from "../utils/url";

interface SeriesState {
  series: Series[];
  activeSeriesId: string;
  categories: string[];
  isLoading: boolean;
  error: string | null;

  // Pagination
  page: number;
  pageSize: number;
  total: number;
  setPage: (page: number) => void;

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

  // Ordering Actions
  reorderSeries: (orderedSeriesIds: string[]) => Promise<void>;
  reorderImages: (seriesId: string, orderedImageIds: string[]) => Promise<void>;

  // Category Actions
  setCategories: (categories: string[]) => void;
  addCategory: (category: string) => Promise<void>;
  updateCategoryName: (oldName: string, newName: string) => Promise<void>;
  deleteCategory: (name: string) => Promise<void>;

  // Hydration / Legacy
  rehydrateImages: () => Promise<void>; // Changed behavior: fetches from R2/Supabase
}

export const useSeriesStore = create<SeriesState>((set, get) => ({
  series: [],
  activeSeriesId: "default",
  categories: ["Manga", "Manhwa", "Webtoon", "Comic", "Uncategorized"],
  isLoading: false,
  error: null,

  // Pagination defaults
  page: 1,
  pageSize: 20,
  total: 0,

  setPage: (page) => {
    set({ page });
    get().fetchSeries();
  },

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

      const { page, pageSize } = get();
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      // Fetch Series & Images
      const {
        data: seriesData,
        error: seriesError,
        count,
      } = await supabase
        .from("series")
        .select(
          `
          *,
          images (*)
        `,
          { count: "exact" }
        )
        .eq("user_id", user.id)
        .order("sequence_number", { ascending: true })
        .order("updated_at", { ascending: false })
        .range(from, to);

      if (seriesError) throw seriesError;

      if (count !== null) set({ total: count });

      // Transform data to local shape
      const transformedSeries: Series[] = seriesData.map((s: any) => ({
        id: s.id,
        name: s.name,
        description: s.description || "",
        category: s.category || "Uncategorized",
        tags: s.tags || [],
        createdAt: new Date(s.created_at).getTime(),
        updatedAt: new Date(s.updated_at).getTime(),
        sequenceNumber: s.sequence_number || 0,
        images: (s.images || [])
          .map((img: any) => ({
            id: img.id,
            fileName: img.file_name,
            originalUrl: img.original_key,
            translatedUrl: img.translated_key,
            status: img.status || "idle",
            originalKey: img.original_key,
            translatedKey: img.translated_key,
            sequenceNumber: img.sequence_number || 0,
            bubbles: [],
          }))
          .sort(
            (a: any, b: any) =>
              a.sequenceNumber - b.sequenceNumber ||
              a.fileName.localeCompare(b.fileName)
          ),
      }));

      // Fetch Categories
      const { data: catData } = await supabase
        .from("categories")
        .select("name");
      if (catData) {
        set({ categories: catData.map((c) => c.name) });
      }

      const fixedSeries = transformedSeries.map((s) => ({
        ...s,
        images: s.images.map((img) => ({
          ...img,
          originalUrl: resolveImageUrl(img.originalUrl),
          translatedUrl: resolveImageUrl(img.translatedUrl),
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
          sequence_number: newSeries.sequenceNumber || 0,
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

      const dbUpdates: any = {
        updated_at: new Date().toISOString(),
      };
      if (updates.name !== undefined) dbUpdates.name = updates.name;
      if (updates.category !== undefined) dbUpdates.category = updates.category;
      if (updates.description !== undefined)
        dbUpdates.description = updates.description;
      if (updates.sequenceNumber !== undefined)
        dbUpdates.sequence_number = updates.sequenceNumber;

      await supabase.from("series").update(dbUpdates).eq("id", id);
    } catch (err) {
      console.error(err);
    }
  },

  deleteSeries: async (id) => {
    const seriesToDelete = get().series.find((s) => s.id === id);
    if (!seriesToDelete) return;

    // Collect all R2 keys to delete
    const keysToDelete: string[] = [];
    seriesToDelete.images.forEach((img) => {
      if (img.originalKey) keysToDelete.push(img.originalKey);
      if (img.translatedKey) keysToDelete.push(img.translatedKey);
    });

    set((state) => {
      const newSeries = state.series.filter((s) => s.id !== id);
      let nextActiveId = state.activeSeriesId;
      if (state.activeSeriesId === id) {
        nextActiveId = newSeries.length > 0 ? newSeries[0].id : "default";
      }
      return { series: newSeries, activeSeriesId: nextActiveId };
    });

    try {
      // 1. Delete from R2
      if (keysToDelete.length > 0) {
        const session = await supabase.auth.getSession();
        await fetch("/api/delete", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.data.session?.access_token}`,
          },
          body: JSON.stringify({ keys: keysToDelete }),
        });
      }

      // 2. Delete from Supabase
      await supabase.from("series").delete().eq("id", id);
    } catch (err) {
      console.error("Delete Series error:", err);
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
          sequence_number: image.sequenceNumber || 0,
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
                      ? {
                          ...img,
                          originalUrl: resolveImageUrl(publicUrl),
                          originalKey: key,
                        }
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
    const targetSeries = get().series.find((s) => s.id === seriesId);
    const imageToDelete = targetSeries?.images.find(
      (img) => img.id === imageId
    );

    set((state) => ({
      series: state.series.map((s) =>
        s.id === seriesId
          ? { ...s, images: s.images.filter((img) => img.id !== imageId) }
          : s
      ),
    }));

    try {
      // 1. Delete from R2
      if (imageToDelete) {
        const keys = [];
        if (imageToDelete.originalKey) keys.push(imageToDelete.originalKey);
        if (imageToDelete.translatedKey) keys.push(imageToDelete.translatedKey);

        if (keys.length > 0) {
          const session = await supabase.auth.getSession();
          await fetch("/api/delete", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.data.session?.access_token}`,
            },
            body: JSON.stringify({ keys }),
          });
        }
      }

      // 2. Delete from Supabase
      await supabase.from("images").delete().eq("id", imageId);
    } catch (err) {
      console.error("Remove Image Error:", err);
    }
  },

  updateImageInSeries: async (seriesId, imageId, updates) => {
    set((state) => ({
      series: state.series.map((s) =>
        s.id === seriesId
          ? {
              ...s,
              images: s.images
                .map((img) =>
                  img.id === imageId ? { ...img, ...updates } : img
                )
                // If sequence updated, re-sort? Maybe better to let component handle visual sort or only re-sort if requested.
                // But for consistency:
                .sort(
                  (a: any, b: any) =>
                    a.sequenceNumber - b.sequenceNumber ||
                    a.fileName.localeCompare(b.fileName)
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
      if (updates.sequenceNumber !== undefined)
        dbUpdates.sequence_number = updates.sequenceNumber;

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
                        translatedUrl: resolveImageUrl(publicUrl),
                        translatedKey: key,
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
  addCategory: async (category) => {
    set((state) => ({ categories: [...state.categories, category] }));
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { error } = await supabase
        .from("categories")
        .insert({ name: category, user_id: user.id });

      if (error) {
        console.error("Add category error:", error);
        // Refresh from DB on error?
        get().fetchSeries();
      }
    }
  },
  updateCategoryName: async (oldName: string, newName: string) => {
    set((state) => ({
      categories: state.categories.map((c) => (c === oldName ? newName : c)),
    }));
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from("categories")
        .update({ name: newName })
        .eq("name", oldName)
        .eq("user_id", user.id);
    }
  },
  deleteCategory: async (name) => {
    set((s) => ({ categories: s.categories.filter((c) => c !== name) }));
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from("categories")
        .delete()
        .eq("name", name)
        .eq("user_id", user.id);
    }
  },

  rehydrateImages: async () => {
    // Now just an alias for fetch
    await get().fetchSeries();
  },

  reorderSeries: async (orderedSeriesIds) => {
    // Optimistic
    set((state) => {
      const seriesMap = new Map(state.series.map((s) => [s.id, s]));
      const newSeriesOrder = orderedSeriesIds
        .map((id) => seriesMap.get(id))
        .filter((s): s is Series => !!s)
        .map((s, index) => ({ ...s, sequenceNumber: index }));

      // Append any series not in the ordered list (shouldn't happen often but safe)
      const remaining = state.series.filter(
        (s) => !orderedSeriesIds.includes(s.id)
      );

      return { series: [...newSeriesOrder, ...remaining] };
    });

    // DB Sync
    try {
      const updates = orderedSeriesIds.map((id, index) => ({
        id,
        sequence_number: index,
        updated_at: new Date().toISOString(),
      }));

      const { error } = await supabase.from("series").upsert(updates);
      if (error) console.error("Reorder Series Error:", error);
    } catch (err) {
      console.error(err);
    }
  },

  reorderImages: async (seriesId, orderedImageIds) => {
    // Optimistic
    set((state) => {
      const series = state.series.find((s) => s.id === seriesId);
      if (!series) return {};

      const imageMap = new Map(series.images.map((img) => [img.id, img]));
      const newImages = orderedImageIds
        .map((id) => imageMap.get(id))
        .filter((img): img is ProcessedImage => !!img)
        .map((img, index) => ({ ...img, sequenceNumber: index }));

      // Append remaining
      const remaining = series.images.filter(
        (img) => !orderedImageIds.includes(img.id)
      );
      const finalImages = [...newImages, ...remaining];

      return {
        series: state.series.map((s) =>
          s.id === seriesId ? { ...s, images: finalImages } : s
        ),
      };
    });

    // DB Sync
    try {
      const updates = orderedImageIds.map((id, index) => ({
        id,
        sequence_number: index,
        // status, etc preserved? Upsert needs careful handling if not all fields present?
        // Supabase upsert requires primary key.
        // We should probably use a custom RPC or just loop updates if upsert is risky on partial data.
        // Or better, just update the sequence_number column.
        // upserting {id, sequence_number} works if we don't violate not-nulls.
        // Assuming other fields are nullable or defaults, or existing rows.
      }));

      // Upsert with only id and sequence_number might wipe other fields if not careful?
      // No, Supabase Upsert updates provided columns match primary key.
      // BUT checks for required columns on INSERT. Since they exist, it's an UPDATE.
      // However, we must ensure we are hitting the update path.

      const { error } = await supabase
        .from("images")
        .upsert(updates, { onConflict: "id", ignoreDuplicates: false });
      if (error) console.error("Reorder Images Error:", error);
    } catch (err) {
      console.error(err);
    }
  },
}));
