import { create } from "zustand";
import { persist } from "zustand/middleware";
import { TranslationSettings } from "../types";

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
        developerMode: false,
        customInstructions: "",
      },
      isViewOnly: process.env.NODE_ENV === "production",
      theme: "dark",

      updateSettings: (newSettings, syncWithDb = true) => {
        set((state) => ({ settings: { ...state.settings, ...newSettings } }));

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
        set((state) => ({ settings: { ...state.settings, ...dbSettings } }));
      },
      toggleViewOnly: () => set((state) => ({ isViewOnly: !state.isViewOnly })),
      setViewOnly: (value) => set({ isViewOnly: value }),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: "mangalens_settings",
      // API keys are never cached in the browser; the server is the source.
      partialize: (state) => ({
        settings: { ...state.settings, ai: undefined },
        theme: state.theme,
      }),
      // Rehydrated on mount by <ThemeApplier /> so server and client render
      // the same defaults first (no hydration mismatch on persisted values).
      skipHydration: true,
    },
  ),
);
