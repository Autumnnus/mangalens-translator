import { seriesService } from "@/services/series.service";
import { SeriesInput } from "@/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export const seriesKeys = {
  all: ["series"] as const,
  lists: () => [...seriesKeys.all, "list"] as const,
  list: (page: number, pageSize: number) =>
    [...seriesKeys.lists(), { page, pageSize }] as const,
  details: () => [...seriesKeys.all, "detail"] as const,
  detail: (id: string) => [...seriesKeys.details(), id] as const,
  images: (id: string) => [...seriesKeys.detail(id), "images"] as const,
};

export const useSeriesQuery = (page = 1, pageSize = 20) => {
  return useQuery({
    queryKey: seriesKeys.list(page, pageSize),
    queryFn: () => seriesService.getSeries(page, pageSize),
  });
};

export const useSeriesImagesQuery = (seriesId: string | null) => {
  return useQuery({
    queryKey: seriesKeys.images(seriesId || ""),
    queryFn: () => seriesService.getSeriesImages(seriesId!),
    enabled: !!seriesId,
  });
};

export const useCreateSeriesMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: SeriesInput) => seriesService.createSeries(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: seriesKeys.lists() });
    },
  });
};

export const useUpdateSeriesMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<SeriesInput>;
    }) => seriesService.updateSeries(id, updates),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: seriesKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: seriesKeys.detail(variables.id),
      });
    },
  });
};

export const useDeleteSeriesMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // 1. Delete from DB (returns keys for storage)
      const keysToDelete = await seriesService.deleteSeries(id);

      // 2. Delete from Storage (MinIO)
      if (keysToDelete && keysToDelete.length > 0) {
        try {
          const res = await fetch("/api/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ keys: keysToDelete }),
          });
          if (!res.ok) {
            console.error("Failed to delete files from MinIO");
          }
        } catch (e) {
          console.error("Storage deletion error:", e);
        }
      }
      return keysToDelete;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: seriesKeys.lists() });
    },
  });
};

export const useSwapSeriesSequenceMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id1, id2 }: { id1: string; id2: string }) =>
      seriesService.swapSeriesSequence(id1, id2),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: seriesKeys.lists() });
    },
  });
};
