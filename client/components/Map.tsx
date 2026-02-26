/**
 * Componente Map
 *
 * Componente principal do mapa para seleção de área e carregamento de dados.
 * Usa MapProvider para gerenciar estado global.
 *
 * NOTA: A edição completa de nós é feita na página de projeto (/projects/[id]).
 * Este componente mostra nós apenas como visualização (pequenos, não interativos).
 */

'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useRouter } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';

// Novo módulo
import {
    MapProvider,
    useMapContext,
    MapErrorBoundary,
    HIGHWAY_COLORS,
    AREA_LIMITS,
    GeoCalculations,
    type BoundingBox,
    type MapContainerProps,
} from '@/features/map';

// Stores
import { useMapStore } from '@/stores/useMapStore';
import { useCreateProject } from '@/stores/useProjectStore';

// ============ MAIN COMPONENT ============

export default function Map({ onBoundingBoxChange, enableBoundingBox = true }: MapContainerProps) {
    return (
        <MapErrorBoundary>
            <MapProvider
                onBboxChange={onBoundingBoxChange ?? undefined}
                onError={(error) => console.error('[Map Error]', error)}
            >
                <MapContent enableBoundingBox={enableBoundingBox} />
            </MapProvider>
        </MapErrorBoundary>
    );
}

// ============ MAP CONTENT ============

function MapContent({ enableBoundingBox }: { enableBoundingBox: boolean }) {
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<L.Map | null>(null);
    const rectangleRef = useRef<L.Rectangle | null>(null);
    const streetsLayerRef = useRef<L.GeoJSON | null>(null);
    const nodesLayerRef = useRef<L.LayerGroup | null>(null);

    const router = useRouter();
    const { mutateAsync: createProject } = useCreateProject();

    // Store
    const { center, zoom, setMapState, hasInitialized, setInitialized } = useMapStore();

    // Context
    const {
        setMap,
        setIsReady,
        viewMode,
        pendingBbox,
        activeBbox,
        bboxArea,
        isProcessing,
        stages,
        errors,
        streetsData,
        streetCount,
        nodes,
        showSaveDialog,
        setShowSaveDialog,
        validationError,
        setPendingBbox,
        confirmBbox,
        cancelBbox,
        clearBbox,
        startProcessing,
        setValidationError,
    } = useMapContext();

    // UI State
    const [isDrawing, setIsDrawing] = useState(false);
    const [cropDimensions, setCropDimensions] = useState<{ width: number; height: number } | null>(null);
    const [lastCenter, setLastCenter] = useState<[number, number]>(center);
    const [lastZoom, setLastZoom] = useState<number>(zoom);
    const [projectName, setProjectName] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const isCropped = viewMode === 'cropped' || viewMode === 'edit';

    // ============ MAP INITIALIZATION ============

    useEffect(() => {
        if (!mapRef.current) return;

        // Clean up previous instance
        if (mapInstanceRef.current) {
            mapInstanceRef.current.remove();
            mapInstanceRef.current = null;
        }

        const mapConfig = isCropped && activeBbox
            ? {
                center: [
                    (activeBbox.southWest.lat + activeBbox.northEast.lat) / 2,
                    (activeBbox.southWest.lng + activeBbox.northEast.lng) / 2,
                ] as [number, number],
                zoom: 15,
            }
            : {
                center: lastCenter,
                zoom: lastZoom,
            };

        const mapInstance = L.map(mapRef.current, {
            center: mapConfig.center,
            zoom: mapConfig.zoom,
            zoomControl: !isCropped,
            dragging: !isCropped,
            scrollWheelZoom: !isCropped,
            doubleClickZoom: !isCropped,
            boxZoom: false,
            keyboard: !isCropped,
        });

        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            subdomains: 'abcd',
            maxZoom: 19,
        }).addTo(mapInstance);

        // If cropped, fit to bounds
        if (isCropped && activeBbox) {
            const bounds = L.latLngBounds(
                [activeBbox.southWest.lat, activeBbox.southWest.lng],
                [activeBbox.northEast.lat, activeBbox.northEast.lng]
            );
            mapInstance.fitBounds(bounds, { animate: false, padding: [10, 10] });
            mapInstance.setMaxBounds(bounds.pad(0.1));
        }

        mapInstanceRef.current = mapInstance;
        setMap(mapInstance);
        setIsReady(true);

        // Create nodes layer group
        nodesLayerRef.current = L.layerGroup().addTo(mapInstance);

        return () => {
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
                nodesLayerRef.current = null;
                setMap(null);
                setIsReady(false);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isCropped, activeBbox]);

    // ============ STORE SYNC ============

    useEffect(() => {
        const mapInstance = mapInstanceRef.current;
        if (!mapInstance || isCropped) return;

        const handleMoveEnd = () => {
            if (!mapInstanceRef.current) return;
            try {
                const c = mapInstance.getCenter();
                const z = mapInstance.getZoom();
                setMapState([c.lat, c.lng], z);
                setLastCenter([c.lat, c.lng]);
                setLastZoom(z);
                if (!hasInitialized) setInitialized();
            } catch {
                // Map may have been removed
            }
        };

        mapInstance.on('moveend', handleMoveEnd);
        return () => {
            if (mapInstanceRef.current) {
                mapInstance.off('moveend', handleMoveEnd);
            }
        };
    }, [isCropped, setMapState, hasInitialized, setInitialized]);

    // ============ BBOX DRAWING ============

    useEffect(() => {
        const mapInstance = mapInstanceRef.current;
        if (!mapInstance || !enableBoundingBox || isCropped) return;

        let startPoint: L.LatLng | null = null;

        const handleMouseDown = (e: L.LeafletMouseEvent) => {
            if (!e.originalEvent.shiftKey) return;
            if (!mapInstanceRef.current) return;

            if (rectangleRef.current) {
                rectangleRef.current.remove();
                rectangleRef.current = null;
            }

            startPoint = e.latlng;
            setIsDrawing(true);
            mapInstance.dragging.disable();
        };

        const handleMouseMove = (e: L.LeafletMouseEvent) => {
            if (!startPoint || !mapInstanceRef.current) return;

            const bounds = L.latLngBounds(startPoint, e.latlng);

            if (rectangleRef.current) {
                rectangleRef.current.setBounds(bounds);
            } else {
                rectangleRef.current = L.rectangle(bounds, {
                    color: '#3b82f6',
                    weight: 2,
                    fillOpacity: 0.1,
                }).addTo(mapInstance);
            }
        };

        const handleMouseUp = (e: L.LeafletMouseEvent) => {
            if (!startPoint || !mapInstanceRef.current) return;

            const bounds = L.latLngBounds(startPoint, e.latlng);
            const bbox: BoundingBox = {
                southWest: { lat: bounds.getSouth(), lng: bounds.getWest() },
                northEast: { lat: bounds.getNorth(), lng: bounds.getEast() },
            };

            const area = GeoCalculations.calculateArea(bbox);

            if (area > AREA_LIMITS.MAX_BBOX_AREA_KM2) {
                setValidationError(`Area exceeds ${AREA_LIMITS.MAX_BBOX_AREA_KM2} km²`);
                if (rectangleRef.current) {
                    rectangleRef.current.setStyle({ color: '#ef4444' });
                }
            } else if (area < 0.001) {
                if (rectangleRef.current) {
                    rectangleRef.current.remove();
                    rectangleRef.current = null;
                }
            } else {
                setPendingBbox(bbox, area);
            }

            startPoint = null;
            setIsDrawing(false);
            mapInstance.dragging.enable();
        };

        mapInstance.on('mousedown', handleMouseDown);
        mapInstance.on('mousemove', handleMouseMove);
        mapInstance.on('mouseup', handleMouseUp);

        return () => {
            if (mapInstanceRef.current) {
                mapInstance.off('mousedown', handleMouseDown);
                mapInstance.off('mousemove', handleMouseMove);
                mapInstance.off('mouseup', handleMouseUp);
            }
        };
    }, [enableBoundingBox, isCropped, setPendingBbox, setValidationError]);

    // ============ STREETS LAYER ============

    useEffect(() => {
        const mapInstance = mapInstanceRef.current;
        if (!mapInstance || !streetsData || !isCropped) return;

        if (streetsLayerRef.current) {
            streetsLayerRef.current.remove();
        }

        streetsLayerRef.current = L.geoJSON(streetsData, {
            style: (feature) => {
                const highway = feature?.properties?.highway || 'default';
                return {
                    color: HIGHWAY_COLORS[highway] || HIGHWAY_COLORS.default,
                    weight: 2,
                    opacity: 0.8,
                };
            },
            onEachFeature: (feature, layer) => {
                const name = feature.properties?.name || 'Unnamed';
                const highway = feature.properties?.highway || 'unknown';
                const elevation = feature.properties?.elevation;

                let tooltipContent = `<strong>${name}</strong><br/>${highway}`;
                if (elevation) {
                    tooltipContent += `<br/><span style="color: #666">Elev: ${elevation.avg?.toFixed(1) ?? 'N/A'}m</span>`;
                }

                layer.bindTooltip(tooltipContent, { sticky: true });
            },
        }).addTo(mapInstance);
    }, [streetsData, isCropped]);

    // ============ NODES LAYER (Read-only, small) ============

    useEffect(() => {
        const mapInstance = mapInstanceRef.current;
        const nodesLayer = nodesLayerRef.current;
        if (!mapInstance || !nodesLayer || !isCropped || nodes.length === 0) return;

        // Clear existing nodes
        nodesLayer.clearLayers();

        // Add nodes as small, read-only circle markers
        nodes.forEach((node) => {
            // Determine color based on node type
            let color = '#8b5cf6'; // violet for intersections (default)
            let radius = 4;
            if (node.isHighestElevation) {
                color = '#ef4444'; // red
                radius = 6;
            } else if (node.isLowestElevation) {
                color = '#06b6d4'; // cyan
                radius = 6;
            } else if (node.isEndpoint) {
                color = '#f59e0b'; // amber
            }

            const marker = L.circleMarker([node.position.lat, node.position.lng], {
                radius,
                color,
                fillColor: color,
                fillOpacity: 0.7,
                weight: 1,
            });

            // Tooltip with elevation and degree info
            const parts: string[] = [];
            if (node.elevation !== null) parts.push(`${node.elevation.toFixed(1)}m`);
            if (node.degree) parts.push(`${node.degree} ruas`);
            if (node.isHighestElevation) parts.push('MAIOR ELEVAÇÃO');
            if (node.isLowestElevation) parts.push('MENOR ELEVAÇÃO');

            marker.bindTooltip(parts.join(' | ') || 'N/A', {
                direction: 'top',
                offset: [0, -5],
                className: 'node-preview-tooltip',
            });

            nodesLayer.addLayer(marker);
        });
    }, [nodes, isCropped]);

    // ============ CONFIRM BBOX ============

    const handleConfirmCrop = useCallback(() => {
        if (!pendingBbox) return;

        if (mapInstanceRef.current) {
            const c = mapInstanceRef.current.getCenter();
            const z = mapInstanceRef.current.getZoom();
            setLastCenter([c.lat, c.lng]);
            setLastZoom(z);
        }

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
        setCropDimensions({ width: Math.max(w, 400), height: Math.max(h, 300) });

        if (rectangleRef.current) {
            rectangleRef.current.remove();
            rectangleRef.current = null;
        }

        confirmBbox();
    }, [pendingBbox, confirmBbox]);

    // ============ CANCEL BBOX ============

    const handleCancelCrop = useCallback(() => {
        if (rectangleRef.current) {
            rectangleRef.current.remove();
            rectangleRef.current = null;
        }
        setValidationError(null);
        cancelBbox();
    }, [cancelBbox, setValidationError]);

    // ============ BACK TO FULL VIEW ============

    const handleBack = useCallback(() => {
        if (streetsLayerRef.current) {
            streetsLayerRef.current = null;
        }
        setCropDimensions(null);
        clearBbox();
    }, [clearBbox]);

    // ============ SAVE PROJECT ============

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
                center: lastCenter,
                zoom: lastZoom,
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
    }, [projectName, activeBbox, streetsData, bboxArea, lastCenter, lastZoom, streetCount, createProject, router]);

    // ============ RENDER ============

    const cardStyle = isCropped && cropDimensions
        ? { width: cropDimensions.width, height: cropDimensions.height }
        : isCropped
            ? { width: 600, height: 500 }
            : undefined;

    return (
        <div className="relative flex h-full w-full flex-col">
            <div className="relative h-full w-full">
                {/* Backdrop */}
                {isCropped && (
                    <div className="absolute inset-0 z-[900] flex items-center justify-center bg-zinc-100 dark:bg-zinc-950" />
                )}

                {/* Map Container */}
                <div
                    key={isCropped ? 'cropped-map' : 'full-map'}
                    ref={mapRef}
                    className={
                        isCropped
                            ? 'absolute left-1/2 top-1/2 z-[901] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl shadow-2xl ring-1 ring-zinc-200 dark:ring-zinc-800 bg-zinc-200 dark:bg-zinc-800'
                            : 'h-full w-full'
                    }
                    style={cardStyle}
                />

                {/* FULL VIEW OVERLAYS */}
                {!isCropped && (
                    <>
                        <div className="absolute bottom-4 right-4 z-[1000] rounded-lg bg-white/95 px-3 py-2 shadow-lg backdrop-blur-sm dark:bg-zinc-900/95">
                            <p className="text-xs text-zinc-600 dark:text-zinc-400">
                                <kbd className="rounded bg-zinc-200 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-700">
                                    Shift
                                </kbd>{' '}
                                + drag to select (max {AREA_LIMITS.MAX_BBOX_AREA_KM2} km²)
                            </p>
                        </div>

                        {isDrawing && (
                            <div className="absolute left-4 top-14 z-[1000] rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white shadow-lg">
                                Drawing area...
                            </div>
                        )}

                        {validationError && (
                            <div className="absolute left-1/2 top-20 z-[1100] -translate-x-1/2 rounded-lg bg-red-500/95 px-4 py-2 text-sm font-medium text-white shadow-lg backdrop-blur-sm">
                                {validationError}
                            </div>
                        )}

                        {pendingBbox && (
                            <div className="absolute right-4 top-4 z-[2000] w-80 rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
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

                {/* CROPPED VIEW OVERLAYS */}
                {isCropped && (
                    <div
                        className="absolute left-1/2 top-1/2 z-[1000] -translate-x-1/2 -translate-y-1/2"
                        style={{ ...cardStyle, pointerEvents: 'none' }}
                    >
                        {/* Control Bar */}
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

                            {!isProcessing && (stages.streets === 'error' || stages.topography === 'error' || stages.nodes === 'error') && (
                                <button
                                    onClick={startProcessing}
                                    className="flex items-center gap-2 rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-medium text-white shadow-md transition-all hover:bg-orange-700"
                                >
                                    Retry
                                </button>
                            )}

                            {stages.streets === 'success' && stages.topography === 'success' && stages.nodes === 'success' && !isSaving && (
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

                            {stages.streets === 'success' && stages.topography === 'success' && stages.nodes === 'success' && (
                                <span className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white shadow-md">
                                    ✓ Processed
                                </span>
                            )}
                        </div>

                        {/* Node count indicator */}
                        {nodes.length > 0 && (
                            <div className="absolute right-3 top-3" style={{ pointerEvents: 'auto' }}>
                                <div className="rounded-lg bg-white/95 px-2 py-1.5 shadow-md backdrop-blur-sm dark:bg-zinc-800/95">
                                    <p className="text-xs text-zinc-600 dark:text-zinc-400">
                                        {nodes.length} nodes (preview)
                                    </p>
                                    <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
                                        Edit in project page
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Error Messages */}
                        {(stages.streets === 'error' || stages.topography === 'error' || stages.nodes === 'error') && (
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

                        {/* Save Dialog */}
                        {showSaveDialog && (
                            <div
                                className="absolute left-3 top-16 z-[1100] w-72 rounded-xl bg-white p-4 shadow-xl ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800"
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

                        {/* Legend */}
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
