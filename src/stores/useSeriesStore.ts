import { create } from "zustand";

/**
 * Only the active series selection lives here. Series, categories and images
 * are fetched and mutated through TanStack Query hooks.
 */
interface SeriesState {
  activeSeriesId: string | null;
  setActiveSeriesId: (id: string | null) => void;
}

export const useSeriesStore = create<SeriesState>((set) => ({
  activeSeriesId: null,
  setActiveSeriesId: (id) => set({ activeSeriesId: id }),
}));
