import { categoryService } from "@/services/category.service";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export const categoryKeys = {
  all: ["categories"] as const,
};

export const useCategoriesQuery = () => {
  return useQuery({
    queryKey: categoryKeys.all,
    queryFn: () => categoryService.getCategories(),
  });
};

export const useCreateCategoryMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      name,
      parentId,
      color,
    }: {
      name: string;
      parentId?: string;
      color?: string;
    }) => categoryService.createCategory(name, parentId, color),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: categoryKeys.all });
    },
  });
};

export const useUpdateCategoryMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      name,
      parentId,
      color,
    }: {
      id: string;
      name: string;
      parentId?: string | null;
      color?: string;
    }) => categoryService.updateCategory(id, name, parentId, color),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: categoryKeys.all });
    },
  });
};

export const useDeleteCategoryMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => categoryService.deleteCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: categoryKeys.all });
    },
  });
};
