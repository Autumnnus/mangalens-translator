import { create } from "zustand";
import { persist } from "zustand/middleware";
import { TranslationSettings } from "../types";

interface SettingsState {
  settings: TranslationSettings;
  isViewOnly: boolean;

  // Actions
  updateSettings: (settings: Partial<TranslationSettings>) => void;
  toggleViewOnly: () => void;
  setViewOnly: (value: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: {
        targetLanguage: "Turkish",
        fontSize: 24,
        fontColor: "#000000",
        backgroundColor: "#ffffff",
        strokeColor: "#ffffff",
      },
      isViewOnly: false,

      updateSettings: (newSettings) =>
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        })),
      toggleViewOnly: () => set((state) => ({ isViewOnly: !state.isViewOnly })),
      setViewOnly: (value) => set({ isViewOnly: value }),
    }),
    {
      name: "mangalens_settings",
      partialize: (state) => ({ settings: state.settings }), // Don't persist viewOnly mode if not desired, or include it if you do
    }
  )
);
