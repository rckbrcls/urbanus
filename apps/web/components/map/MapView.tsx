'use client';

import { useRef, useCallback, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';
import MapGL, { type MapRef, type ViewStateChangeEvent } from 'react-map-gl/maplibre';
import type { LngLatBoundsLike } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { useMapStore } from '@/stores/useMapStore';
import { useAreaSelectionStore } from '@/stores/areaSelectionStore';
import { useCreateProject } from '@/stores/useProjectStore';
import { MAP_STYLES } from '@/lib/map/styles';
import { AREA_LIMITS } from '@urbanus/constants';
import { HIGHWAY_COLORS } from '@/features/map/constants';

import BboxDrawControl from './BboxDrawControl';
import StreetsLayer from './StreetsLayer';
import PreviewNodesLayer from './PreviewNodesLayer';

export default function MapView() {
  const mapRef = useRef<MapRef>(null);
  const router = useRouter();
  const { mutateAsync: createProject } = useCreateProject();

  // Map position store
  const center = useMapStore((s) => s.center);
  const zoom = useMapStore((s) => s.zoom);
  const setMapState = useMapStore((s) => s.setMapState);
  const hasInitialized = useMapStore((s) => s.hasInitialized);
  const setInitialized = useMapStore((s) => s.setInitialized);

  // Area selection store
  const viewMode = useAreaSelectionStore((s) => s.viewMode);
  const pendingBbox = useAreaSelectionStore((s) => s.pendingBbox);
  const activeBbox = useAreaSelectionStore((s) => s.activeBbox);
  const bboxArea = useAreaSelectionStore((s) => s.bboxArea);
  const stages = useAreaSelectionStore((s) => s.stages);
  const errors = useAreaSelectionStore((s) => s.errors);
  const isProcessing = useAreaSelectionStore((s) => s.isProcessing);
  const streetsData = useAreaSelectionStore((s) => s.streetsData);
  const streetCount = useAreaSelectionStore((s) => s.streetCount);
  const nodes = useAreaSelectionStore((s) => s.nodes);
  const showSaveDialog = useAreaSelectionStore((s) => s.showSaveDialog);
  const validationError = useAreaSelectionStore((s) => s.validationError);

  const confirmBbox = useAreaSelectionStore((s) => s.confirmBbox);
  const cancelBbox = useAreaSelectionStore((s) => s.cancelBbox);
  const clearBbox = useAreaSelectionStore((s) => s.clearBbox);
  const startProcessing = useAreaSelectionStore((s) => s.startProcessing);
  const setShowSaveDialog = useAreaSelectionStore((s) => s.setShowSaveDialog);
  const setValidationError = useAreaSelectionStore((s) => s.setValidationError);

  // Local UI state
  const [projectName, setProjectName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const isCropped = viewMode === 'cropped';

  // ============ MAP CALLBACKS ============

  const handleMoveEnd = useCallback(
    (e: ViewStateChangeEvent) => {
      if (isCropped) return;
      const { latitude, longitude, zoom: z } = e.viewState;
      setMapState([latitude, longitude], z);
      if (!hasInitialized) setInitialized();
    },
    [isCropped, setMapState, hasInitialized, setInitialized],
  );

  // ============ ACTIONS ============

  const handleConfirmCrop = useCallback(() => {
    confirmBbox();
    setValidationError(null);
  }, [confirmBbox, setValidationError]);

  const handleCancelCrop = useCallback(() => {
    cancelBbox();
    setValidationError(null);
  }, [cancelBbox, setValidationError]);

  const handleBack = useCallback(() => {
    clearBbox();
  }, [clearBbox]);

  const handleSaveProject = useCallback(async () => {
    if (!projectName.trim() || !activeBbox || !streetsData) return;
    setIsSaving(true);
    try {
      const newProject = {
        id: uuidv4(),
        name: projectName.trim(),
        createdAt: Date.now(),
        bounds: activeBbox,
        areaKm2: bboxArea,
        center: center,
        zoom: zoom,
        stats: { streetCount: streetCount || 0 },
        streets: streetsData,
      };
      await createProject(newProject);
      router.push('/projects');
    } catch (error) {
      console.error('Failed to save project:', error);
    } finally {
      setIsSaving(false);
    }
  }, [projectName, activeBbox, streetsData, bboxArea, center, zoom, streetCount, createProject, router]);

  // ============ COMPUTED ============

  const maxBounds = useMemo((): LngLatBoundsLike | undefined => {
    if (!isCropped || !activeBbox) return undefined;
    const pad = 0.01; // small padding
    return [
      [activeBbox.southWest.lng - pad, activeBbox.southWest.lat - pad],
      [activeBbox.northEast.lng + pad, activeBbox.northEast.lat + pad],
    ];
  }, [isCropped, activeBbox]);

  const croppedInitialView = useMemo(() => {
    if (!activeBbox) return undefined;
    return {
      latitude: (activeBbox.southWest.lat + activeBbox.northEast.lat) / 2,
      longitude: (activeBbox.southWest.lng + activeBbox.northEast.lng) / 2,
      zoom: 15,
    };
  }, [activeBbox]);

  const allStagesSuccess = stages.streets === 'success' && stages.topography === 'success' && stages.nodes === 'success';
  const hasError = stages.streets === 'error' || stages.topography === 'error' || stages.nodes === 'error';

  // ============ RENDER ============

  return (
    <div className="relative flex h-full w-full flex-col">
      <div className="relative h-full w-full">
        {/* Backdrop for cropped view */}
        {isCropped && (
          <div className="absolute inset-0 z-[5] bg-zinc-100 dark:bg-zinc-950" />
        )}

        {/* Map */}
        <div
          key={isCropped ? 'cropped' : 'explore'}
          className={
            isCropped
              ? 'absolute left-1/2 top-1/2 z-[6] h-[70vh] w-[70vw] max-w-[900px] max-h-[700px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl shadow-2xl ring-1 ring-zinc-200 dark:ring-zinc-800'
              : 'h-full w-full'
          }
        >
          <MapGL
            ref={mapRef}
            key={isCropped ? 'cropped-map' : 'explore-map'}
            initialViewState={
              isCropped && croppedInitialView
                ? croppedInitialView
                : { latitude: center[0], longitude: center[1], zoom }
            }
            mapStyle={MAP_STYLES.voyager}
            onMoveEnd={handleMoveEnd}
            maxBounds={maxBounds}
            dragPan={!isCropped || true}
            scrollZoom={!isCropped || true}
            style={{ width: '100%', height: '100%' }}
            attributionControl={{ compact: true }}
          >
            {/* Bbox drawing (explore mode only) */}
            {!isCropped && <BboxDrawControl />}

            {/* Streets (cropped mode) */}
            {isCropped && streetsData && <StreetsLayer data={streetsData} />}

            {/* Preview nodes (cropped mode) */}
            {isCropped && nodes.length > 0 && <PreviewNodesLayer nodes={nodes} />}
          </MapGL>
        </div>

        {/* ============ EXPLORE VIEW OVERLAYS ============ */}
        {!isCropped && (
          <>
            {/* Instructions */}
            <div className="absolute bottom-4 right-4 z-[10] rounded-lg bg-white/95 px-3 py-2 shadow-lg backdrop-blur-sm dark:bg-zinc-900/95">
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                <kbd className="rounded bg-zinc-200 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-700">
                  Shift
                </kbd>{' '}
                + drag to select (max {AREA_LIMITS.MAX_BBOX_AREA_KM2} km²)
              </p>
            </div>

            {/* Validation error */}
            {validationError && (
              <div className="absolute left-1/2 top-20 z-[20] -translate-x-1/2 rounded-lg bg-red-500/95 px-4 py-2 text-sm font-medium text-white shadow-lg backdrop-blur-sm">
                {validationError}
              </div>
            )}

            {/* Crop confirmation dialog */}
            {pendingBbox && (
              <div className="absolute right-4 top-4 z-[20] w-80 rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
                <h3 className="mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  Crop to area?
                </h3>
                <div className="mb-4 space-y-2 text-xs">
                  <p className="text-zinc-600 dark:text-zinc-400">
                    Area: <strong className="text-zinc-900 dark:text-zinc-100">{bboxArea.toFixed(2)} km²</strong>
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleCancelCrop}
                    className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmCrop}
                    className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                  >
                    Crop
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ============ CROPPED VIEW OVERLAYS ============ */}
        {isCropped && (
          <div
            className="absolute left-1/2 top-1/2 z-[10] h-[70vh] w-[70vw] max-w-[900px] max-h-[700px] -translate-x-1/2 -translate-y-1/2"
            style={{ pointerEvents: 'none' }}
          >
            {/* Control bar */}
            <div className="absolute left-3 top-3 flex items-center gap-2" style={{ pointerEvents: 'auto' }}>
              <button
                onClick={handleBack}
                className="flex items-center gap-2 rounded-lg bg-white/95 px-3 py-1.5 text-sm font-medium text-zinc-800 shadow-md backdrop-blur-sm transition-all hover:bg-white dark:bg-zinc-800/95 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                ← Back
              </button>

              <span className="rounded-lg bg-white/95 px-2 py-1 text-xs text-zinc-600 shadow-md backdrop-blur-sm dark:bg-zinc-800/95 dark:text-zinc-400">
                {bboxArea.toFixed(1)} km²
              </span>

              {!isProcessing && stages.streets === 'pending' && (
                <button
                  onClick={startProcessing}
                  className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-md transition-all hover:bg-blue-700"
                >
                  Fetch Data
                </button>
              )}

              {!isProcessing && hasError && (
                <button
                  onClick={startProcessing}
                  className="flex items-center gap-2 rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-medium text-white shadow-md transition-all hover:bg-orange-700"
                >
                  Retry
                </button>
              )}

              {allStagesSuccess && !isSaving && (
                <button
                  onClick={() => setShowSaveDialog(true)}
                  className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-md transition-all hover:bg-emerald-700"
                >
                  Save Project
                </button>
              )}

              {isProcessing && (
                <span className="flex items-center gap-2 rounded-lg bg-blue-600/80 px-3 py-1.5 text-sm font-medium text-white shadow-md">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Processing...
                </span>
              )}

              {allStagesSuccess && (
                <span className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white shadow-md">
                  ✓ Processed
                </span>
              )}
            </div>

            {/* Node count */}
            {nodes.length > 0 && (
              <div className="absolute right-3 top-3" style={{ pointerEvents: 'auto' }}>
                <div className="rounded-lg bg-white/95 px-2 py-1.5 shadow-md backdrop-blur-sm dark:bg-zinc-800/95">
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">{nodes.length} nodes (preview)</p>
                  <p className="text-[10px] text-zinc-400 dark:text-zinc-500">Edit in project page</p>
                </div>
              </div>
            )}

            {/* Error messages */}
            {hasError && (
              <div className="absolute left-3 top-14 flex flex-col gap-2" style={{ pointerEvents: 'auto' }}>
                {stages.streets === 'error' && (
                  <span className="rounded-lg bg-red-500/95 px-3 py-1.5 text-sm font-medium text-white shadow-md backdrop-blur-sm">
                    Streets: {errors.streets || 'Failed'}
                  </span>
                )}
                {stages.topography === 'error' && (
                  <span className="rounded-lg bg-red-500/95 px-3 py-1.5 text-sm font-medium text-white shadow-md backdrop-blur-sm">
                    Topography: {errors.topography || 'Failed'}
                  </span>
                )}
                {stages.nodes === 'error' && (
                  <span className="rounded-lg bg-red-500/95 px-3 py-1.5 text-sm font-medium text-white shadow-md backdrop-blur-sm">
                    Nodes: {errors.nodes || 'Failed'}
                  </span>
                )}
              </div>
            )}

            {/* Save dialog */}
            {showSaveDialog && (
              <div
                className="absolute left-3 top-16 z-[30] w-72 rounded-xl bg-white p-4 shadow-xl ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800"
                style={{ pointerEvents: 'auto' }}
              >
                <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Name your project
                </h3>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="My Awesome Project"
                  className="mb-3 w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:text-zinc-100 dark:placeholder-zinc-500"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setShowSaveDialog(false);
                      setProjectName('');
                    }}
                    className="flex-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveProject}
                    disabled={!projectName.trim() || isSaving}
                    className="flex-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {isSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            )}

            {/* Streets legend */}
            {streetCount > 0 && (
              <div
                className="absolute bottom-3 left-3 rounded-lg bg-white/95 p-2.5 shadow-md backdrop-blur-sm dark:bg-zinc-800/95"
                style={{ pointerEvents: 'auto' }}
              >
                <p className="mb-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  {streetCount} streets
                </p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
                  {Object.entries(HIGHWAY_COLORS).map(([type, color]) => (
                    <div key={type} className="flex items-center gap-1">
                      <div className="h-1.5 w-3 rounded-sm" style={{ backgroundColor: color }} />
                      <span className="text-zinc-600 dark:text-zinc-400">{type}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
