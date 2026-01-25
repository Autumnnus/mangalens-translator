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

      // 1. Get presigned URLs in batch
      const uploadReqItems = items.map((item) => ({
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

      if (!res.ok) throw new Error("Failed to get upload URLs in batch");
      const { items: uploadUrls } = await res.json();

      // 2. Upload to storage in parallel
      await Promise.all(
        items.map((item, idx) => {
          if (!item.file) return Promise.resolve();
          return fetch(uploadUrls[idx].uploadUrl, {
            method: "PUT",
            body: item.file,
            headers: { "Content-Type": item.file.type || "image/jpeg" },
          });
        }),
      );

      // 3. Batch DB insert
      const dbItems = items.map((item, idx) => ({
        ...item.image,
        originalKey: uploadUrls[idx].key,
      }));

      return imageService.addImages(seriesId, dbItems);
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
      seriesId,
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
    mutationFn: ({
      seriesId,
      imageId,
    }: {
      seriesId: string;
      imageId: string;
    }) => imageService.deleteImage(imageId),
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
    mutationFn: ({
      seriesId,
      imageIds,
    }: {
      seriesId: string;
      imageIds: string[];
    }) => imageService.reorderImages(imageIds),
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
      queryClient.invalidateQueries({ queryKey: seriesKeys.lists() });
    },
  });
};
