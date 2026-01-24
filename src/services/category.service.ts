import {
  createCategoryAction,
  deleteCategoryAction,
  fetchCategoriesAction,
  updateCategoryAction,
} from "@/actions/categories";
import { Category } from "@/types";

export const categoryService = {
  getCategories: async (): Promise<Category[]> => {
    const data = await fetchCategoriesAction();
    return data.map((c) => ({
      id: c.id,
      name: c.name,
      parentId: c.parentId,
      color: c.color || undefined,
    }));
  },

  createCategory: async (name: string, parentId?: string, color?: string) => {
    return await createCategoryAction(name, parentId, color);
  },

  updateCategory: async (
    id: string,
    name: string,
    parentId?: string | null,
    color?: string,
  ) => {
    return await updateCategoryAction(id, name, parentId, color);
  },

  deleteCategory: async (id: string) => {
    return await deleteCategoryAction(id);
  },
};
