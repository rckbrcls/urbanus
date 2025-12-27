'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { BoundingBox, MapContainerProps } from './types';
import { useMapInstance } from './hooks/useMapInstance';
import { useBoundingBoxDrawing } from './hooks/useBoundingBoxDrawing';
import { useDataProcessing } from './hooks/useDataProcessing';
import { MAX_AREA_KM2, HIGHWAY_COLORS } from './constants';

export default function Map({
  center = [-23.5505, -46.6333],
  zoom = 13,
  onBoundingBoxChange,
  enableBoundingBox = true,
}: MapContainerProps) {
  const mapRef = useRef<HTMLDivElement>(null);

  // States
  const [isCropped, setIsCropped] = useState(false);
  const [pendingBbox, setPendingBbox] = useState<BoundingBox | null>(null);
  const [activeBbox, setActiveBbox] = useState<BoundingBox | null>(null);
  const [areaKm2, setAreaKm2] = useState(0);
  const [showCropConfirm, setShowCropConfirm] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  // Store the center of the selection to restore view later
  const [lastCenter, setLastCenter] = useState<[number, number]>(center);

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
  } = useMapInstance(mapRef, { center, zoom });

  // Data Processing Hook
  const {
    isProcessing,
    streetCount,
    stages,
    processData,
    resetProcessing,
  } = useDataProcessing({
    onStreetsLoaded: (geojson) => {
      addStreetsLayer(geojson);
    },
  });

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
    onValidSelection: handleValidSelection,
    onInvalidSelection: handleInvalidSelection,
  });

  // Confirm Crop
  const handleConfirmCrop = useCallback(() => {
    if (!pendingBbox) return;

    const bboxCenter: [number, number] = [
      (pendingBbox.southWest.lat + pendingBbox.northEast.lat) / 2,
      (pendingBbox.southWest.lng + pendingBbox.northEast.lng) / 2,
    ];
    setLastCenter(bboxCenter);

    lockToBox(pendingBbox);
    setActiveBbox(pendingBbox);
    setShowCropConfirm(false);
    setPendingBbox(null);
    setIsCropped(true);
    onBoundingBoxChange?.(pendingBbox);
  }, [pendingBbox, lockToBox, onBoundingBoxChange]);

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
    unlockMap(lastCenter, zoom);
    setActiveBbox(null);
    setIsCropped(false);
    resetProcessing();
    onBoundingBoxChange?.(null);
  }, [unlockMap, lastCenter, zoom, resetProcessing, onBoundingBoxChange]);

  // Calculate Aspect Ratio
  const getAspectRatio = useCallback(() => {
    if (!activeBbox) return 1;
    const latDiff = activeBbox.northEast.lat - activeBbox.southWest.lat;
    const lonDiff = activeBbox.northEast.lng - activeBbox.southWest.lng;
    const avgLat = (activeBbox.northEast.lat + activeBbox.southWest.lat) / 2;
    const adjustedLonDiff = lonDiff * Math.cos((avgLat * Math.PI) / 180);
    return adjustedLonDiff / latDiff;
  }, [activeBbox]);

  const aspectRatio = getAspectRatio();
  const cardStyle = isCropped ? {
    aspectRatio,
    maxWidth: 'min(90vw, 900px)',
    maxHeight: 'min(80vh, 700px)',
    width: aspectRatio > 1 ? 'min(90vw, 900px)' : 'auto',
    height: aspectRatio <= 1 ? 'min(80vh, 700px)' : 'auto',
  } : {};

  // Handle Resize on View Change
  useEffect(() => {
    if (isCropped && activeBbox) {
      setTimeout(() => {
        invalidateSize();
        refitBounds(activeBbox);
      }, 150);
    }
  }, [isCropped, activeBbox, invalidateSize, refitBounds]);

  return (
    <div className="relative flex h-full w-full flex-col">
      <div className="h-full w-full relative">

        {/* Backdrop for Cropped View */}
        {isCropped && (
          <div className="absolute inset-0 z-[900] flex items-center justify-center bg-zinc-100 dark:bg-zinc-950" />
        )}

        {/* Map Container - Dynamic Positioning */}
        <div
          ref={mapRef}
          className={`h-full w-full ${isCropped ? 'absolute left-1/2 top-1/2 z-[901] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl shadow-2xl ring-1 ring-zinc-200 dark:ring-zinc-800' : ''}`}
          style={isCropped ? cardStyle : undefined}
        />

        {/* FULL VIEW OVERLAYS */}
        {!isCropped && (
          <>
            {/* Instructions */}
            <div className="absolute left-4 top-4 z-[1000] rounded-lg bg-white/95 px-3 py-2 shadow-lg backdrop-blur-sm dark:bg-zinc-900/95">
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
              {!isProcessing && stages.streets === 'pending' && (
                <button onClick={handleProcessData} className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-md transition-all hover:bg-blue-700">
                  Fetch Data
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
              {stages.streets === 'success' && (
                <span className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white shadow-md">
                  ✓ Processed
                </span>
              )}
            </div>

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
