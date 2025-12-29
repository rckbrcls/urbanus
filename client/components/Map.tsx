'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { BoundingBox, MapContainerProps } from '../types/map-types';

import { MAX_AREA_KM2, HIGHWAY_COLORS } from '../constants/map-constants';
import { useRouter } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';
import { useMapStore } from '@/stores/useMapStore';
import { useProjectStore } from '@/stores/useProjectStore';
import { useBoundingBoxDrawing } from '@/hooks/useBoundingBoxDrawing';
import { useDataProcessing } from '@/hooks/useDataProcessing';
import { useMapInstance } from '@/hooks/useMapInstance';

export default function Map({
  onBoundingBoxChange,
  enableBoundingBox = true,
}: MapContainerProps) {
  const mapRef = useRef<HTMLDivElement>(null);

  // Persistent Store
  const { center, zoom, setMapState, hasInitialized, setInitialized } = useMapStore();

  // States
  const [isCropped, setIsCropped] = useState(false);
  const [pendingBbox, setPendingBbox] = useState<BoundingBox | null>(null);
  const [activeBbox, setActiveBbox] = useState<BoundingBox | null>(null);
  const [areaKm2, setAreaKm2] = useState(0);
  const [showCropConfirm, setShowCropConfirm] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  // Store the center and zoom of the selection to restore view later
  const [lastCenter, setLastCenter] = useState<[number, number]>(center);
  const [lastZoom, setLastZoom] = useState<number>(zoom);
  const [cropDimensions, setCropDimensions] = useState<{ width: number; height: number } | null>(null);

  // Project Save State
  const [isSaving, setIsSaving] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  const router = useRouter();
  const addProject = useProjectStore(state => state.addProject);

  // Dynamic Map Configuration
  // We determine the initial center/zoom for the map instance based on the mode.
  // This ensures that when we remount (due to the key change), the new map starts exactly where we want.
  const mapConfig = {
    center: isCropped ? lastCenter : center,
    zoom: isCropped ? lastZoom : zoom
  };

  // Map Hooks
  const {
    mapInstanceRef,
    rectangleRef,
    streetsLayerRef,
    lockToBox,
    unlockMap,
    addStreetsLayer,
    invalidateSize,
    refitBounds,
    isMapReady,
  } = useMapInstance(mapRef, mapConfig);

  // Update store when map moves (only in full view)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const handleMoveEnd = () => {
      if (!isCropped) {
        const c = map.getCenter();
        const z = map.getZoom();
        setMapState([c.lat, c.lng], z);
        if (!hasInitialized) setInitialized();
      }
    };

    map.on('moveend', handleMoveEnd);
    return () => {
      map.off('moveend', handleMoveEnd);
    };
  }, [mapInstanceRef, isCropped, setMapState, hasInitialized, setInitialized, isMapReady]);


  // Data Processing Hook
  const {
    isProcessing,
    streetCount,
    stages,
    processData,
    resetProcessing,
    errors,
    topographyBlob,
  } = useDataProcessing({
    onStreetsLoaded: (geojson) => {
      setStreetsData(geojson);
      // Pass null initially, will update when topography is ready
      addStreetsLayer(geojson, null);
    },
  });

  // Store streets data to allow re-rendering with topography
  const [streetsData, setStreetsData] = useState<GeoJSON.FeatureCollection | null>(null);

  // Re-add layer when topography blob is available to enrich tooltips
  useEffect(() => {
    if (stages.streets === 'success' && topographyBlob && streetsData) {
      addStreetsLayer(streetsData, topographyBlob);
    }
  }, [topographyBlob, stages.streets, streetsData, addStreetsLayer]);



  // Selection Handlers
  const handleValidSelection = useCallback((bbox: BoundingBox, area: number) => {
    setValidationError(null);
    setPendingBbox(bbox);
    setAreaKm2(area);
    setShowCropConfirm(true);
  }, []);

  const handleInvalidSelection = useCallback((error: string) => {
    setValidationError(error);
    setPendingBbox(null);
    setShowCropConfirm(false);
  }, []);

  // Drawing Hook
  const { isDrawing, clearRectangle } = useBoundingBoxDrawing({
    mapInstanceRef,
    rectangleRef,
    streetsLayerRef,
    enabled: enableBoundingBox && !isCropped,
    isMapReady,
    onValidSelection: handleValidSelection,
    onInvalidSelection: handleInvalidSelection,
    center,
    zoom,
  });

  // Confirm Crop
  const handleConfirmCrop = useCallback(() => {
    console.log("handleConfirmCrop called", { pendingBbox });
    if (!pendingBbox) return;

    // Calculate center of the selection to ensure it's visible in the cropped view
    const bboxCenter: [number, number] = [
      (pendingBbox.southWest.lat + pendingBbox.northEast.lat) / 2,
      (pendingBbox.southWest.lng + pendingBbox.northEast.lng) / 2,
    ];

    // Capture current zoom
    const currentZoom = mapInstanceRef.current?.getZoom() || zoom;

    // Save state for restoration (and for the crop view)
    setLastCenter(bboxCenter);
    setLastZoom(currentZoom);

    try {
      // Note: We don't call lockToBox here anymore.
      // We wait for the useEffect to handle the view lock after the layout transition/resize
      // to ensure the map centers correctly on the new container size.

      setActiveBbox(pendingBbox);

      // Calculate optimized dimensions
      const latDiff = pendingBbox.northEast.lat - pendingBbox.southWest.lat;
      const lonDiff = pendingBbox.northEast.lng - pendingBbox.southWest.lng;
      const avgLat = (pendingBbox.northEast.lat + pendingBbox.southWest.lat) / 2;
      const adjustedLonDiff = lonDiff * Math.cos((avgLat * Math.PI) / 180);
      const ratio = adjustedLonDiff / latDiff;

      const maxWidth = Math.min(window.innerWidth * 0.9, 900);
      const maxHeight = Math.min(window.innerHeight * 0.8, 700);

      let w, h;
      if (ratio > 1) {
        w = maxWidth;
        h = maxWidth / ratio;
        if (h > maxHeight) {
          h = maxHeight;
          w = maxHeight * ratio;
        }
      } else {
        h = maxHeight;
        w = maxHeight * ratio;
        if (w > maxWidth) {
          w = maxWidth;
          h = maxWidth / ratio;
        }
      }
      setCropDimensions({ width: w, height: h });
      console.log("Calculated crop dimensions:", { width: w, height: h, ratio, maxWidth, maxHeight });

      setShowCropConfirm(false);
      setPendingBbox(null);
      setIsCropped(true);
      onBoundingBoxChange?.(pendingBbox);
      console.log("crop confirmed and state updated.");
    } catch (error) {
      console.error("Error in handleConfirmCrop:", error);
    }
  }, [pendingBbox, lockToBox, onBoundingBoxChange, mapInstanceRef, zoom]);

  // Cancel Crop
  const handleCancelCrop = useCallback(() => {
    setShowCropConfirm(false);
    setPendingBbox(null);
    clearRectangle();
  }, [clearRectangle]);

  // Process Data
  const handleProcessData = useCallback(() => {
    if (!activeBbox) return;
    processData(activeBbox);
  }, [activeBbox, processData]);

  // Back to Full View
  const handleBackToFullView = useCallback(() => {
    // Only update state here, unlockMap will be called in useEffect after resize
    setActiveBbox(null);
    setIsCropped(false);
    setCropDimensions(null);
    resetProcessing();
    onBoundingBoxChange?.(null);
  }, [resetProcessing, onBoundingBoxChange]);

  // Handle Resize and View Transitions
  const cardStyle = (isCropped && cropDimensions) ? {
    width: cropDimensions.width,
    height: cropDimensions.height,
  } : (isCropped ? { width: '500px', height: '400px' } : undefined); // Fallback

  // Handle View State Changes
  useEffect(() => {
    // Strategy: FRESH INSTANCE
    // When isCropped changes, the 'key' on the div changes, forcing a full remount.
    // We simply wait for the new map to be ready and then apply our constraints.

    if (!isMapReady) return;

    if (isCropped && activeBbox) {
      // The map is new, but we still need to apply the specific bounds/locking
      // to ensure it matches the bbox exactly and interactions are disabled.

      // FIX: Use fitBounds (default behavior of lockToBox) instead of forcing a specific view.
      // This ensures Leaflet calculates the precise center (handling Mercator projection)
      // and zoom level to perfectly fill the new container size.
      lockToBox(activeBbox);
    } else if (!isCropped) {
      // Full view restored. The map is fresh and interactive by default (from hook),
      // but we ensure it's unlocked and pointing at the right place.
      unlockMap(lastCenter, lastZoom);
    }
  }, [isCropped, activeBbox, isMapReady, lockToBox, unlockMap, lastCenter, lastZoom]);

  return (
    <div className="relative flex h-full w-full flex-col">
      <div className="h-full w-full relative">

        {/* Backdrop for Cropped View */}
        {isCropped && (
          <div className="absolute inset-0 z-[900] flex items-center justify-center bg-zinc-100 dark:bg-zinc-950" />
        )}

        {/* Map Container - Dynamic Positioning */}
        {/* KEY CHANGE: The 'key' prop forces React to destroy and recreate the DOM node (and thus the Leaflet instance)
            whenever we switch modes. This is the "Nuclear Option" for reliability. */}
        <div
          key={isCropped ? 'cropped' : 'full'}
          ref={mapRef}
          className={`${isCropped ? 'absolute left-1/2 top-1/2 z-[901] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl shadow-2xl ring-1 ring-zinc-200 dark:ring-zinc-800 bg-zinc-200 dark:bg-zinc-800' : 'h-full w-full'}`}
          style={cardStyle}
        />

        {/* FULL VIEW OVERLAYS */}
        {!isCropped && (
          <>
            {/* Instructions */}
            <div className="absolute right-4 bottom-4 z-[1000] rounded-lg bg-white/95 px-3 py-2 shadow-lg backdrop-blur-sm dark:bg-zinc-900/95">
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                <kbd className="rounded bg-zinc-200 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-700">Shift</kbd> + drag to select (max {MAX_AREA_KM2} km²)
              </p>
            </div>

            {/* Drawing Indicator */}
            {isDrawing && (
              <div className="absolute left-4 top-14 z-[1000] rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white shadow-lg">
                Drawing area...
              </div>
            )}

            {/* Validation Error */}
            {validationError && (
              <div className="absolute left-1/2 top-20 z-[1100] -translate-x-1/2 rounded-lg bg-red-500/95 px-4 py-2 text-sm font-medium text-white shadow-lg backdrop-blur-sm animate-in fade-in slide-in-from-top-4">
                ⚠️ {validationError}
              </div>
            )}

            {/* Crop Confirmation Modal */}
            {showCropConfirm && pendingBbox && (
              <div className="absolute right-4 top-4 z-[2000] w-80 rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
                <h3 className="mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-100">Crop to area?</h3>
                <div className="mb-4 space-y-2 text-xs">
                  <p className="text-zinc-600 dark:text-zinc-400">Area: <strong className="text-zinc-900 dark:text-zinc-100">{areaKm2.toFixed(2)} km²</strong></p>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleCancelCrop} className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">Cancel</button>
                  <button onClick={handleConfirmCrop} className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700">Crop</button>
                </div>
              </div>
            )}
          </>
        )}

        {/* CROPPED VIEW OVERLAYS */}
        {isCropped && (
          <div className="absolute left-1/2 top-1/2 z-[1000] -translate-x-1/2 -translate-y-1/2" style={{ ...cardStyle, pointerEvents: 'none' }}>

            {/* Control Bar */}
            <div className="absolute left-3 top-3 flex items-center gap-2" style={{ pointerEvents: 'auto' }}>
              <button onClick={handleBackToFullView} className="flex items-center gap-2 rounded-lg bg-white/95 px-3 py-1.5 text-sm font-medium text-zinc-800 shadow-md backdrop-blur-sm transition-all hover:bg-white dark:bg-zinc-800/95 dark:text-zinc-100 dark:hover:bg-zinc-800">
                ← Back
              </button>
              <span className="rounded-lg bg-white/95 px-2 py-1 text-xs text-zinc-600 shadow-md backdrop-blur-sm dark:bg-zinc-800/95 dark:text-zinc-400">
                {areaKm2.toFixed(1)} km²
              </span>

              {/* Process Button */}
              {!isProcessing && (stages.streets === 'pending' || stages.streets === 'error' || stages.topography === 'error') && (
                <button onClick={handleProcessData} className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-md transition-all hover:bg-blue-700">
                  {stages.streets === 'error' || stages.topography === 'error' ? 'Retry Fetch' : 'Fetch Data'}
                </button>
              )}

              {/* Save Project Button */}
              {stages.streets === 'success' && stages.topography === 'success' && !isSaving && (
                <button
                  onClick={() => setShowSaveDialog(true)}
                  className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-md transition-all hover:bg-emerald-700"
                >
                  Save Project
                </button>
              )}

              {/* Processing Indicator */}
              {isProcessing && (
                <span className="flex items-center gap-2 rounded-lg bg-blue-600/80 px-3 py-1.5 text-sm font-medium text-white shadow-md">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Processing...
                </span>
              )}

              {/* Success Indicator */}
              {stages.streets === 'success' && stages.topography === 'success' && (
                <span className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white shadow-md">
                  ✓ Processed
                </span>
              )}

              {/* Error Messages */}
              {(stages.streets === 'error' || stages.topography === 'error') && (
                <div className="absolute top-12 left-0 flex flex-col gap-2">
                  {stages.streets === 'error' && (
                    <span className="flex items-center gap-2 rounded-lg bg-red-500/95 px-3 py-1.5 text-sm font-medium text-white shadow-md backdrop-blur-sm">
                      ⚠️ Streets: {errors.streets || 'Failed to load'}
                    </span>
                  )}
                  {stages.topography === 'error' && (
                    <span className="flex items-center gap-2 rounded-lg bg-red-500/95 px-3 py-1.5 text-sm font-medium text-white shadow-md backdrop-blur-sm">
                      ⚠️ Topography: {errors.topography || 'Failed to load'}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Save Project Dialog */}
            {showSaveDialog && (
              <div className="absolute top-16 left-3 z-[1100] w-72 rounded-xl bg-white p-4 shadow-xl ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800" style={{ pointerEvents: 'auto' }}>
                <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Name your project</h3>
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
                    onClick={() => {
                      if (!projectName.trim() || !activeBbox) return;

                      const newProject = {
                        id: uuidv4(),
                        name: projectName.trim(),
                        createdAt: Date.now(),
                        bounds: activeBbox,
                        areaKm2: areaKm2,
                        center: lastCenter,
                        zoom: lastZoom,
                        stats: {
                          streetCount: streetCount || 0,
                        }
                      };

                      addProject(newProject);
                      setIsSaving(true); // Show saving state briefly if needed
                      router.push('/projects');
                    }}
                    disabled={!projectName.trim()}
                    className="flex-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
              </div>
            )}


            {/* Legend */}
            {streetCount !== undefined && (
              <div className="absolute bottom-3 left-3 rounded-lg bg-white/95 p-2.5 shadow-md backdrop-blur-sm dark:bg-zinc-800/95" style={{ pointerEvents: 'auto' }}>
                <p className="mb-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300">{streetCount} streets</p>
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
