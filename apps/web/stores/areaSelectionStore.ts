/**
 * Area Selection Store
 *
 * Manages the bbox-selection → processing → save workflow on the home page.
 * Replaces the MapContext reducer for this specific flow.
 */

import { create } from 'zustand';
import type { BoundingBox, MapNode } from '@/features/map/types';
import type { EnrichedFeatureCollection } from '@/features/map/types/elevation.types';
import { StreetsService } from '@/features/map/services/StreetsService';
import { ElevationService } from '@/features/map/services/ElevationService';
import { NodesApiService } from '@/features/map/services/NodesApiService';

// ============ TYPES ============

export type ProcessingStage = 'pending' | 'loading' | 'success' | 'error';

export interface AreaSelectionState {
  viewMode: 'explore' | 'cropped';
  pendingBbox: BoundingBox | null;
  activeBbox: BoundingBox | null;
  bboxArea: number;

  stages: { streets: ProcessingStage; topography: ProcessingStage; nodes: ProcessingStage };
  errors: { streets: string | null; topography: string | null; nodes: string | null };
  isProcessing: boolean;

  streetsData: EnrichedFeatureCollection | null;
  streetCount: number;
  nodes: MapNode[];

  showCropConfirm: boolean;
  showSaveDialog: boolean;
  validationError: string | null;
}

export interface AreaSelectionActions {
  setPendingBbox: (bbox: BoundingBox | null, area?: number) => void;
  confirmBbox: () => void;
  cancelBbox: () => void;
  clearBbox: () => void;
  startProcessing: () => Promise<void>;
  setShowSaveDialog: (show: boolean) => void;
  setValidationError: (error: string | null) => void;
  resetToExplore: () => void;
}

// ============ INITIAL STATE ============

const initialState: AreaSelectionState = {
  viewMode: 'explore',
  pendingBbox: null,
  activeBbox: null,
  bboxArea: 0,
  stages: { streets: 'pending', topography: 'pending', nodes: 'pending' },
  errors: { streets: null, topography: null, nodes: null },
  isProcessing: false,
  streetsData: null,
  streetCount: 0,
  nodes: [],
  showCropConfirm: false,
  showSaveDialog: false,
  validationError: null,
};

// ============ STORE ============

export const useAreaSelectionStore = create<AreaSelectionState & AreaSelectionActions>()(
  (set, get) => ({
    ...initialState,

    setPendingBbox: (bbox, area) => {
      set({
        pendingBbox: bbox,
        bboxArea: area ?? 0,
        showCropConfirm: bbox !== null,
        validationError: null,
      });
    },

    confirmBbox: () => {
      const { pendingBbox, bboxArea } = get();
      if (!pendingBbox) return;
      set({
        activeBbox: pendingBbox,
        pendingBbox: null,
        viewMode: 'cropped',
        showCropConfirm: false,
        bboxArea,
      });
    },

    cancelBbox: () => {
      set({
        pendingBbox: null,
        showCropConfirm: false,
        validationError: null,
      });
    },

    clearBbox: () => {
      set({ ...initialState });
    },

    startProcessing: async () => {
      const { activeBbox } = get();
      if (!activeBbox) return;

      set({
        isProcessing: true,
        stages: { streets: 'loading', topography: 'pending', nodes: 'pending' },
        errors: { streets: null, topography: null, nodes: null },
      });

      const streetsService = StreetsService.getInstance();
      const elevationService = ElevationService.getInstance();
      const nodesApiService = NodesApiService.getInstance();

      try {
        // 1. Fetch streets
        const streetsResult = await streetsService.fetchStreets(activeBbox);
        set({
          streetsData: streetsResult.geojson as unknown as EnrichedFeatureCollection,
          streetCount: streetsResult.metadata.totalStreets,
          stages: { ...get().stages, streets: 'success' },
        });

        // 2. Enrich with elevation
        set({ stages: { ...get().stages, topography: 'loading' } });
        const enriched = await elevationService.fetchEnrichedGeoJSON(
          streetsResult.geojson,
          activeBbox,
        );
        set({
          streetsData: enriched,
          stages: { ...get().stages, topography: 'success' },
        });

        // 3. Extract nodes
        set({ stages: { ...get().stages, nodes: 'loading' } });
        const { nodes: extractedNodes } = await nodesApiService.extractNodes(enriched);
        set({
          nodes: extractedNodes,
          stages: { ...get().stages, nodes: 'success' },
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        const { stages } = get();

        if (stages.streets !== 'success') {
          set({
            stages: { ...stages, streets: 'error' },
            errors: { ...get().errors, streets: msg },
          });
        } else if (stages.topography !== 'success') {
          set({
            stages: { ...stages, topography: 'error' },
            errors: { ...get().errors, topography: msg },
          });
        } else {
          set({
            stages: { ...stages, nodes: 'error' },
            errors: { ...get().errors, nodes: msg },
          });
        }
      } finally {
        set({ isProcessing: false });
      }
    },

    setShowSaveDialog: (show) => set({ showSaveDialog: show }),
    setValidationError: (error) => set({ validationError: error }),
    resetToExplore: () => set({ ...initialState }),
  }),
);
