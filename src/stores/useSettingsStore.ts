import { create } from "zustand";
import { persist } from "zustand/middleware";
import { TranslationSettings } from "../types";

interface SettingsState {
  settings: TranslationSettings;
  isViewOnly: boolean;

  // Actions
  updateSettings: (
    settings: Partial<TranslationSettings>,
    syncWithDb?: boolean,
  ) => void;
  initializeSettings: (settings: TranslationSettings) => void;
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
        customInstructions: "",
        model: "gemini-1.5-flash",
      },
      isViewOnly: process.env.NODE_ENV === "production",

      updateSettings: (newSettings, syncWithDb = true) => {
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        }));

        if (syncWithDb) {
          // Import dynamic to avoid circular dependencies if any or keep it simple
          import("../actions/settings").then((mod) => {
            mod.updateUserSettingsAction(newSettings);
          });
        }
      },
      initializeSettings: (dbSettings) => {
        set({ settings: dbSettings });
      },
      toggleViewOnly: () => set((state) => ({ isViewOnly: !state.isViewOnly })),
      setViewOnly: (value) => set({ isViewOnly: value }),
    }),
    {
      name: "mangalens_settings",
      partialize: (state) => ({ settings: state.settings }),
    },
  ),
);
