import { create } from "zustand";
import { persist } from "zustand/middleware";
import { GEMINI_MODELS, TranslationSettings } from "../types";

interface SettingsState {
  settings: TranslationSettings;
  isViewOnly: boolean;

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
        model: GEMINI_MODELS[0]?.id || "gemini-2.5-flash",
        batchSize: 10,
        batchDelay: 0,
        useCustomApiKey: false,
        customApiKeyPool: "",
        namedApiKeys: [],
      },
      isViewOnly: process.env.NODE_ENV === "production",

      updateSettings: (newSettings, syncWithDb = true) => {
        const validModelIds = new Set(GEMINI_MODELS.map((m) => m.id));

        set((state) => ({
          settings: {
            ...state.settings,
            ...newSettings,
            model: validModelIds.has(String(newSettings.model))
              ? String(newSettings.model)
              : state.settings.model,
          },
        }));

        if (syncWithDb) {
          import("../actions/settings").then((mod) => {
            mod.updateUserSettingsAction(newSettings);
          });
        }
      },
      initializeSettings: (dbSettings) => {
        const validModelIds = new Set(GEMINI_MODELS.map((m) => m.id));
        set((state) => ({
          settings: {
            ...state.settings,
            ...dbSettings,
            model: validModelIds.has(dbSettings.model)
              ? dbSettings.model
              : state.settings.model,
          },
        }));
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
