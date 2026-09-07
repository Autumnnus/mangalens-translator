"use client";

import { useEffect } from "react";
import { useSettingsStore } from "../stores/useSettingsStore";

/** Mirrors the stored theme onto <html data-theme>. Dark is the default. */
export default function ThemeApplier() {
  const theme = useSettingsStore((state) => state.theme);

  // Persisted settings are read from localStorage only on the client.
  useEffect(() => {
    void useSettingsStore.persist.rehydrate();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "light") root.dataset.theme = "light";
    else delete root.dataset.theme;
  }, [theme]);

  return null;
}
