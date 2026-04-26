import { imageService } from "@/services/image.service";
import { ProcessedImage } from "@/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { seriesKeys } from "./useSeriesQueries";

export const useAddImageMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      seriesId,
      image,
      file,
    }: {
      seriesId: string;
      image: Partial<ProcessedImage>;
      file?: File | Blob;
    }) => {
      let originalKey = image.originalKey;

      if (file) {
        // 1. Get presigned URL
        const res = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: image.fileName || (file as File).name,
            contentType: file.type,
            seriesId,
          }),
        });

        if (!res.ok) throw new Error("Failed to get upload URL");
        const { uploadUrl, key } = await res.json();
        originalKey = key;

        // 2. Upload to MinIO
        const uploadRes = await fetch(uploadUrl, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type },
        });

        if (!uploadRes.ok) throw new Error("Failed to upload to storage");
      }

      return imageService.addImage(seriesId, {
        ...image,
        originalKey,
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: seriesKeys.images(variables.seriesId),
      });
      queryClient.invalidateQueries({ queryKey: seriesKeys.lists() });
    },
  });
};

export const useBatchAddImagesMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      seriesId,
      items,
    }: {
      seriesId: string;
      items: { image: Partial<ProcessedImage>; file?: File | Blob }[];
    }) => {
      if (items.length === 0) return;

      const CHUNK_SIZE = 50;
      const CONCURRENT_UPLOADS = 10;

      const chunks = [];
      for (let i = 0; i < items.length; i += CHUNK_SIZE) {
        chunks.push(items.slice(i, i + CHUNK_SIZE));
      }

      for (const chunk of chunks) {
        // 1. Get presigned URLs in batch per chunk
        const uploadReqItems = chunk.map((item) => ({
          fileName:
            item.image.fileName ||
            (item.file instanceof File ? item.file.name : "unknown"),
          contentType: item.file?.type || "image/jpeg",
          seriesId,
        }));

        const res = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: uploadReqItems }),
        });

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`Failed to get upload URLs: ${errorText}`);
        }
        const { items: uploadUrls } = await res.json();

        // 2. Upload to storage with concurrency limit and validation
        const uploadPromises = [];
        for (let i = 0; i < chunk.length; i += CONCURRENT_UPLOADS) {
          const batch = chunk.slice(i, i + CONCURRENT_UPLOADS);
          const batchPromises = batch.map(async (item, localIdx) => {
            const globalIdx = i + localIdx;
            if (!item.file) return { success: true, idx: globalIdx };

            try {
              const uploadRes = await fetch(uploadUrls[globalIdx].uploadUrl, {
                method: "PUT",
                body: item.file,
                headers: { "Content-Type": item.file.type || "image/jpeg" },
              });

              if (!uploadRes.ok) {
                console.error(
                  `Failed to upload ${item.image.fileName}: ${uploadRes.status}`,
                );
                return {
                  success: false,
                  idx: globalIdx,
                  error: uploadRes.statusText,
                };
              }
              return { success: true, idx: globalIdx };
            } catch (error) {
              console.error(`Upload error for ${item.image.fileName}:`, error);
              return { success: false, idx: globalIdx, error: String(error) };
            }
          });
          const results = await Promise.all(batchPromises);
          uploadPromises.push(...results);
        }

        const failedUploads = uploadPromises.filter((r) => !r.success);
        if (failedUploads.length > 0) {
          console.error(`${failedUploads.length} uploads failed`);
          throw new Error(
            `${failedUploads.length} out of ${chunk.length} uploads failed`,
          );
        }

        // 3. Batch DB insert only for successful uploads
        const dbItems = chunk.map((item, idx) => ({
          ...item.image,
          originalKey: uploadUrls[idx].key,
        }));

        try {
          await imageService.addImages(seriesId, dbItems);
        } catch (error) {
          console.error("DB insert failed:", error);
          throw new Error(`Database insert failed: ${String(error)}`);
        }
      }
    },
    onMutate: async ({ seriesId, items }) => {
      await queryClient.cancelQueries({
        queryKey: seriesKeys.images(seriesId),
      });
      const previousImages = queryClient.getQueryData<ProcessedImage[]>(
        seriesKeys.images(seriesId),
      );

      const optimisticItems: ProcessedImage[] = items.map((item, idx) => ({
        id: `optimistic-${Date.now()}-${idx}`,
        fileName:
          item.image.fileName ||
          (item.file instanceof File ? item.file.name : "unknown"),
        originalUrl: "", // Temporary
        translatedUrl: null,
        status: "processing",
        bubbles: [],
        sequenceNumber: item.image.sequenceNumber || 0,
      }));

      queryClient.setQueryData<ProcessedImage[]>(
        seriesKeys.images(seriesId),
        (old) => [...(old || []), ...optimisticItems],
      );

      return { previousImages };
    },
    onError: (err, { seriesId }, context) => {
      if (context?.previousImages) {
        queryClient.setQueryData(
          seriesKeys.images(seriesId),
          context.previousImages,
        );
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: seriesKeys.images(variables.seriesId),
      });
      queryClient.invalidateQueries({ queryKey: seriesKeys.lists() });
    },
  });
};

export const useUpdateImageMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      imageId,
      updates,
    }: {
      seriesId: string;
      imageId: string;
      updates: Partial<ProcessedImage>;
    }) => imageService.updateImage(imageId, updates),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: seriesKeys.images(variables.seriesId),
      });
    },
  });
};

export const useDeleteImageMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ imageId }: { seriesId: string; imageId: string }) =>
      imageService.deleteImage(imageId),
    onMutate: async ({ seriesId, imageId }) => {
      await queryClient.cancelQueries({
        queryKey: seriesKeys.images(seriesId),
      });

      const previousImages = queryClient.getQueryData<ProcessedImage[]>(
        seriesKeys.images(seriesId),
      );

      queryClient.setQueryData<ProcessedImage[]>(
        seriesKeys.images(seriesId),
        (old) => (old || []).filter((img) => img.id !== imageId),
      );

      return { previousImages };
    },
    onError: (err, { seriesId }, context) => {
      if (context?.previousImages) {
        queryClient.setQueryData(
          seriesKeys.images(seriesId),
          context.previousImages,
        );
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: seriesKeys.images(variables.seriesId),
      });
      queryClient.invalidateQueries({ queryKey: seriesKeys.lists() });
    },
  });
};

export const useReorderImagesMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ imageIds }: { seriesId: string; imageIds: string[] }) =>
      imageService.reorderImages(imageIds),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: seriesKeys.images(variables.seriesId),
      });
    },
  });
};

interface ImageTranslationMeta {
  bubbles: import("@/types").TextBubble[];
  usage: import("@/types").UsageMetadata;
  cost: number;
}

export const useSaveTranslatedImageMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      seriesId,
      imageId,
      blob,
      fileName,
      meta,
    }: {
      seriesId: string;
      imageId: string;
      blob: Blob;
      fileName: string;
      meta?: ImageTranslationMeta;
    }) => {
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: `translated_${fileName}`,
          contentType: blob.type,
          seriesId,
        }),
      });

      if (!res.ok) throw new Error("Failed to get upload URL");
      const { uploadUrl, key } = await res.json();

      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        body: blob,
        headers: { "Content-Type": blob.type },
      });

      if (!uploadRes.ok) throw new Error("Failed to upload translated image");

      const updates: Partial<ProcessedImage> = {
        translatedKey: key,
        status: "completed" as ProcessedImage["status"],
        bubbles: meta?.bubbles || [],
        usage: meta?.usage || undefined,
        cost: meta?.cost || 0,
      };

      return await imageService.updateImage(imageId, updates);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: seriesKeys.images(variables.seriesId),
      });
    },
  });
};

export const useSetImageStatusMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      seriesId,
      imageId,
      status,
    }: {
      seriesId: string;
      imageId: string;
      status: ProcessedImage["status"];
    }) => imageService.setImageStatus({ seriesId, imageId, status }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: seriesKeys.images(variables.seriesId),
      });
      queryClient.invalidateQueries({ queryKey: seriesKeys.lists() });
    },
  });
};
