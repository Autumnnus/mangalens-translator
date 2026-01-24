import { create } from "zustand";
import { ConfirmConfig, ProcessedImage } from "../types";

interface UIState {
  // Modal States
  isSidebarOpen: boolean;
  isSettingsModalOpen: boolean;
  isCategoryModalOpen: boolean;
  isNewSeriesModalOpen: boolean;

  // Specific UI State
  editingSeriesId: string | null;
  currentImageIndex: number;
  selectedImage: ProcessedImage | null; // For modal view
  categoryInitialParentId: string | null;

  // Confirmation Modal
  confirmConfig: ConfirmConfig & { isOpen: boolean };

  // Actions
  toggleSidebar: (value?: boolean) => void;
  toggleSettingsModal: (value?: boolean) => void;
  toggleCategoryModal: (
    value?: boolean,
    initialParentId?: string | null,
  ) => void;
  toggleNewSeriesModal: (value?: boolean) => void;

  setEditingSeriesId: (id: string | null) => void;
  setCurrentImageIndex: (index: number) => void;
  setSelectedImage: (image: ProcessedImage | null) => void;

  openConfirmModal: (config: ConfirmConfig) => void;
  closeConfirmModal: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  isSidebarOpen: false,
  isSettingsModalOpen: false,
  isCategoryModalOpen: false,
  isNewSeriesModalOpen: false,

  editingSeriesId: null,
  currentImageIndex: 0,
  selectedImage: null,
  categoryInitialParentId: null,

  confirmConfig: {
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  },

  toggleSidebar: (value) =>
    set((state) => ({ isSidebarOpen: value ?? !state.isSidebarOpen })),
  toggleSettingsModal: (value) =>
    set((state) => ({
      isSettingsModalOpen: value ?? !state.isSettingsModalOpen,
    })),
  toggleCategoryModal: (value, initialParentId = null) =>
    set((state) => ({
      isCategoryModalOpen: value ?? !state.isCategoryModalOpen,
      categoryInitialParentId: initialParentId,
    })),
  toggleNewSeriesModal: (value) =>
    set((state) => ({
      isNewSeriesModalOpen: value ?? !state.isNewSeriesModalOpen,
    })),

  setEditingSeriesId: (id) => set({ editingSeriesId: id }),
  setCurrentImageIndex: (index) => set({ currentImageIndex: index }),
  setSelectedImage: (image) => set({ selectedImage: image }),

  openConfirmModal: (config) =>
    set({ confirmConfig: { ...config, isOpen: true } }),
  closeConfirmModal: () =>
    set((state) => ({
      confirmConfig: { ...state.confirmConfig, isOpen: false },
    })),
}));
