import { create } from "zustand";

interface ConfirmConfig {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  type?: "danger" | "warning";
}

interface UIState {
  // Modal States
  isSidebarOpen: boolean;
  isSettingsModalOpen: boolean;
  isCategoryModalOpen: boolean;
  isNewSeriesModalOpen: boolean;

  // Specific UI State
  editingSeriesId: string | null;
  currentImageIndex: number;
  selectedImageId: string | null; // For modal view

  // Confirmation Modal
  confirmConfig: ConfirmConfig;

  // Actions
  toggleSidebar: (value?: boolean) => void;
  toggleSettingsModal: (value?: boolean) => void;
  toggleCategoryModal: (value?: boolean) => void;
  toggleNewSeriesModal: (value?: boolean) => void;

  setEditingSeriesId: (id: string | null) => void;
  setCurrentImageIndex: (index: number) => void;
  setSelectedImageId: (id: string | null) => void;

  openConfirmModal: (config: Omit<ConfirmConfig, "isOpen">) => void;
  closeConfirmModal: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  isSidebarOpen: false,
  isSettingsModalOpen: false,
  isCategoryModalOpen: false,
  isNewSeriesModalOpen: false,

  editingSeriesId: null,
  currentImageIndex: 0,
  selectedImageId: null,

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
  toggleCategoryModal: (value) =>
    set((state) => ({
      isCategoryModalOpen: value ?? !state.isCategoryModalOpen,
    })),
  toggleNewSeriesModal: (value) =>
    set((state) => ({
      isNewSeriesModalOpen: value ?? !state.isNewSeriesModalOpen,
    })),

  setEditingSeriesId: (id) => set({ editingSeriesId: id }),
  setCurrentImageIndex: (index) => set({ currentImageIndex: index }),
  setSelectedImageId: (id) => set({ selectedImageId: id }),

  openConfirmModal: (config) =>
    set({ confirmConfig: { ...config, isOpen: true } }),
  closeConfirmModal: () =>
    set((state) => ({
      confirmConfig: { ...state.confirmConfig, isOpen: false },
    })),
}));
