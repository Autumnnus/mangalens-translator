"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { useSeriesStore } from "../stores/useSeriesStore";
import { useSettingsStore } from "../stores/useSettingsStore";
import { useUIStore } from "../stores/useUIStore";

export function useUrlSync() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeSeriesId = useSeriesStore((state) => state.activeSeriesId);
  const setActiveSeriesId = useSeriesStore((state) => state.setActiveSeriesId);

  const editorPage = useUIStore((state) => state.editorPage);
  const setEditorPage = useUIStore((state) => state.setEditorPage);

  const currentImageIndex = useUIStore((state) => state.currentImageIndex);
  const setCurrentImageIndex = useUIStore(
    (state) => state.setCurrentImageIndex,
  );

  const isViewOnly = useSettingsStore((state) => state.isViewOnly);
  const setViewOnly = useSettingsStore((state) => state.setViewOnly);

  const isInitialized = useRef(false);

  // Sync URL to Store (Initial load)
  useEffect(() => {
    if (isInitialized.current) return;

    const seriesId = searchParams.get("series");
    const page = searchParams.get("page");
    const index = searchParams.get("index");
    const mode = searchParams.get("mode");

    if (seriesId) setActiveSeriesId(seriesId);
    if (page) setEditorPage(parseInt(page, 10) || 1);
    if (index) setCurrentImageIndex(parseInt(index, 10) || 0);

    if (mode === "reader") setViewOnly(true);
    else if (mode === "editor") setViewOnly(false);

    isInitialized.current = true;
  }, [
    searchParams,
    setActiveSeriesId,
    setEditorPage,
    setCurrentImageIndex,
    setViewOnly,
  ]);

  // Sync Store to URL
  useEffect(() => {
    if (!isInitialized.current) return;

    const params = new URLSearchParams(searchParams.toString());

    if (activeSeriesId) params.set("series", activeSeriesId);
    else params.delete("series");

    params.set("page", editorPage.toString());
    params.set("index", currentImageIndex.toString());
    params.set("mode", isViewOnly ? "reader" : "editor");

    const newQuery = params.toString();
    const currentQuery = searchParams.toString();

    if (newQuery !== currentQuery) {
      router.replace(`${pathname}?${newQuery}`, { scroll: false });
    }
  }, [
    activeSeriesId,
    editorPage,
    currentImageIndex,
    isViewOnly,
    pathname,
    router,
    searchParams,
  ]);
}
