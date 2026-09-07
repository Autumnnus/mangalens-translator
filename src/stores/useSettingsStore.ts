import { create } from "zustand";
import { persist } from "zustand/middleware";
import { GEMINI_MODELS, TranslationSettings } from "../types";

export type Theme = "dark" | "light";

interface SettingsState {
  settings: TranslationSettings;
  isViewOnly: boolean;
  /** UI theme. Dark is the default; persisted locally, not synced to the DB. */
  theme: Theme;

  updateSettings: (
    settings: Partial<TranslationSettings>,
    syncWithDb?: boolean,
  ) => void;
  initializeSettings: (settings: TranslationSettings) => void;
  toggleViewOnly: () => void;
  setViewOnly: (value: boolean) => void;
  setTheme: (theme: Theme) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: {
        targetLanguage: "Turkish",
        translationPipeline: "auto",
        developerMode: false,
        customInstructions: "",
        model: GEMINI_MODELS[0]?.id || "gemini-2.5-flash-lite",
        fallbackModel: "gemini-2.5-flash",
        enableQualityFallback: true,
        useGeminiBatch: true,
        batchSize: 10,
        batchDelay: 0,
        useCustomApiKey: false,
        customApiKeyPool: "",
        namedApiKeys: [],
      },
      isViewOnly: process.env.NODE_ENV === "production",
      theme: "dark",

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
          void fetch("/api/settings", {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            credentials: "same-origin",
            body: JSON.stringify(newSettings),
          }).catch((error) => {
            console.error("Failed to sync settings:", error);
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
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: "mangalens_settings",
      partialize: (state) => ({ settings: state.settings, theme: state.theme }),
      // Rehydrated on mount by <ThemeApplier /> so server and client render
      // the same defaults first (no hydration mismatch on persisted values).
      skipHydration: true,
    },
  ),
);
