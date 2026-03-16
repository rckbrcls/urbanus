import { create } from "zustand";
import { persist } from "zustand/middleware";

interface MapState {
  center: [number, number];
  zoom: number;
  setMapState: (center: [number, number], zoom: number) => void;
  hasInitialized: boolean;
  setInitialized: () => void;
}

export const useMapStore = create<MapState>()(
  persist(
    (set) => ({
      center: [-23.5505, -46.6333],
      zoom: 13,
      hasInitialized: false,
      setMapState: (center, zoom) => set({ center, zoom }),
      setInitialized: () => set({ hasInitialized: true }),
    }),
    {
      name: "map-storage",
    }
  )
);
