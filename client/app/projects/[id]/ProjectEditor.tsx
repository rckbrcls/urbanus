'use client';

import { useDeleteProject, useUpdateProject } from '../../../stores/useProjectStore';
import type { Project } from '../../../stores/useProjectStore';
import { useRouter } from 'next/navigation';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ArrowLeft, Trash2, Download, Save, Undo2, Redo2, Network } from 'lucide-react';

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { HIGHWAY_COLORS } from '@/features/map/constants';
import { NodesService } from '@/features/map/services/NodesService';
import { useNodeDrag } from '@/features/map/hooks/useNodeDrag';
import { useElevationSync } from '@/features/map/hooks/useElevationSync';
import { MapNode, NodeEditMode } from '@/features/map/types/node.types';
import { LatLng } from '@/features/map/types/map.types';
import { GraphProcessingPanel } from '@/features/map/components/GraphProcessingPanel';
import { EdgesLayer, NodesLayer } from '@/features/map/components';
import {
    MapContainer,
    TileLayer,
    Rectangle,
    useMapEvents,
    useMap,
} from '@/features/map/utils';
import { useThrottle } from '@/features/map/utils/throttle';
import type L from 'leaflet';
import { GeoCalculations } from '@/lib/geo/calculations';

// ============ TYPES ============

interface EdgeData {
    id: string;
    streetId: string;
    streetName?: string;
    highway?: string;
    startNode: MapNode;
    endNode: MapNode;
}
// ============ MAP CONTENT ============

function MapContent({
    nodes,
    setNodes,
    editMode,
    selectedIds,
    hoveredId,
    onNodeClick,
    onNodeHover,
    onModifiedNode,
    onEdgeClick,
    findNearestEdge,
}: {
    nodes: MapNode[];
    setNodes: React.Dispatch<React.SetStateAction<MapNode[]>>;
    editMode: NodeEditMode;
    selectedIds: string[];
    hoveredId: string | null;
    onNodeClick: (node: MapNode) => void;
    onNodeHover: (nodeId: string | null) => void;
    onModifiedNode: (nodeId: string) => void;
    onEdgeClick?: (edge: EdgeData, clickPosition: LatLng) => void;
    findNearestEdge?: (clickPosition: LatLng, thresholdMeters?: number) => EdgeData | null;
}) {
    const map = useMap();

    const {
        draggedNodeId,
        dragPosition,
        startDrag,
        updateDrag,
        endDrag,
    } = useNodeDrag({
        nodes,
        setNodes,
        bbox: null,
        onDragStart: (_node) => {
            // Disable map dragging when starting node drag
            map.dragging.disable();
        },
        onDragEnd: (node, _finalPosition) => {
            // Re-enable map dragging
            map.dragging.enable();
            // Mark node as modified for elevation sync
            onModifiedNode(node.id);
        },
        onDragCancel: (_node) => {
            // Re-enable map dragging on cancel
            map.dragging.enable();
        },
    });

    // Disable map dragging when in add mode
    useEffect(() => {
        if (editMode === 'add') {
            map.dragging.disable();
        } else {
            map.dragging.enable();
        }
    }, [editMode, map]);

    // Throttle mousemove para ~60fps (16ms) - reduz chamadas de 200+/s para ~60/s
    // A animação visual continua suave via RAF no updateDrag
    const throttledUpdateDrag = useThrottle(
        useCallback(
            (position: LatLng) => {
                if (draggedNodeId) {
                    updateDrag(position);
                }
            },
            [draggedNodeId, updateDrag]
        ),
        16 // ~60fps
    );

    useMapEvents({
        mousemove: (e) => {
            if (draggedNodeId) {
                const position: LatLng = {
                    lat: e.latlng.lat,
                    lng: e.latlng.lng,
                };
                throttledUpdateDrag(position);
            }
        },
        mouseup: () => {
            if (draggedNodeId) {
                endDrag();
            }
        },
        click: (e) => {
            // Handle map clicks in add mode to find nearest edge
            if (editMode === 'add' && onEdgeClick && findNearestEdge) {
                const clickPosition: LatLng = {
                    lat: e.latlng.lat,
                    lng: e.latlng.lng,
                };
                // Find nearest edge if click wasn't directly on an edge
                const nearestEdge = findNearestEdge(clickPosition, 50);
                if (nearestEdge) {
                    onEdgeClick(nearestEdge, clickPosition);
                }
            }
        },
    });

    const handleNodeClick = useCallback(
        (node: MapNode) => {
            onNodeClick(node);
        },
        [onNodeClick]
    );

    return (
        <>
            {/* Edges layer - imperative Leaflet for smoother zoom/pan */}
            <EdgesLayer
                mapInstance={map}
                nodes={nodes}
                draggedNodeId={draggedNodeId}
                dragPosition={dragPosition}
                showTooltips
                onEdgeClick={editMode === 'add' ? onEdgeClick : undefined}
            />

            {/* Nodes layer - imperative Leaflet for smoother zoom/pan */}
            <NodesLayer
                mapInstance={map}
                nodes={nodes}
                selectedIds={selectedIds}
                hoveredId={hoveredId}
                draggedNodeId={draggedNodeId}
                dragPosition={dragPosition}
                editMode={editMode}
                editable
                dragRequiresSelection={false}
                onNodeClick={handleNodeClick}
                onNodeHover={onNodeHover}
                onDragStart={startDrag}
            />
        </>
    );
}

// ============ MAIN VIEW ============

interface ProjectEditorProps {
    project?: Project;
    isLoading: boolean;
}

export function ProjectEditor({ project, isLoading }: ProjectEditorProps) {
    const router = useRouter();
    const { mutateAsync: deleteProject } = useDeleteProject();
    const { mutateAsync: updateProject } = useUpdateProject();

    const [activeTab, setActiveTab] = useState<'overview' | 'streets'>('overview');
    const [isMounted, setIsMounted] = useState(false);

    // Node editing state
    const [nodes, setNodes] = useState<MapNode[]>([]);
    const [originalStreets, setOriginalStreets] = useState<any>(null);
    const [editMode, setEditMode] = useState<NodeEditMode>('move');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);
    const [isGraphProcessingOpen, setIsGraphProcessingOpen] = useState(false);
    const didInitRef = useRef(false);

    // NodesService for undo/redo
    const nodesService = useRef(NodesService.getInstance()).current;

    // Elevation sync hook
    const {
        markModified,
        syncElevations,
        hasPending: hasElevationChanges,
        pendingCount: pendingElevationCount,
    } = useElevationSync({
        elevationData: null, // We don't have elevation data in project page yet
        onSync: (syncedNodes) => {
            setNodes(syncedNodes);
        },
    });

    useEffect(() => {
        setIsMounted(true);
    }, []);

    // Initialize nodes from project data (only once)
    useEffect(() => {
        if (project?.streets && !didInitRef.current) {
            didInitRef.current = true;
            setOriginalStreets(project.streets);
            const extractedNodes = nodesService.extractNodesFromStreets(project.streets);
            setNodes(extractedNodes);
            setHasChanges(false);
        }
    }, [project, nodesService]);

    const handleNodeClick = useCallback(
        (node: MapNode) => {
            if (editMode === 'delete') {
                try {
                    const validation = nodesService.validateDelete(node);
                    if (validation.valid) {
                        const { nodes: newNodes } = nodesService.deleteNode(nodes, node.id);
                        setNodes(newNodes);
                        setHasChanges(true);
                    } else {
                        alert(validation.error?.message || 'Cannot delete node');
                    }
                } catch (e) {
                    console.error(e);
                }
            } else {
                // Toggle selection
                setSelectedIds((prev) =>
                    prev.includes(node.id)
                        ? prev.filter((id) => id !== node.id)
                        : [...prev, node.id]
                );
            }
        },
        [editMode, nodes, nodesService]
    );

    const handleNodeHover = useCallback((nodeId: string | null) => {
        setHoveredId(nodeId);
    }, []);

    const handleModifiedNode = useCallback(
        (nodeId: string) => {
            markModified(nodeId);
            setHasChanges(true);
        },
        [markModified]
    );

    // Helper function to calculate distance from point to line segment
    // Uses a simplified approach: finds the closest point on the segment
    const calculateDistanceToSegment = useCallback(
        (point: LatLng, segmentStart: LatLng, segmentEnd: LatLng): number => {
            // Calculate distances to endpoints
            const distToStart = GeoCalculations.calculateDistance(point, segmentStart);
            const distToEnd = GeoCalculations.calculateDistance(point, segmentEnd);
            const segmentLength = GeoCalculations.calculateDistance(segmentStart, segmentEnd);

            // If segment is very short, return distance to midpoint
            if (segmentLength < 1) {
                return Math.min(distToStart, distToEnd);
            }

            // Calculate the point on the segment closest to the click point
            // Using a simple linear interpolation approach
            // Project point onto the line segment
            const dx = segmentEnd.lng - segmentStart.lng;
            const dy = segmentEnd.lat - segmentStart.lat;
            const dpx = point.lng - segmentStart.lng;
            const dpy = point.lat - segmentStart.lat;

            // Calculate t (parameter along the segment, 0 = start, 1 = end)
            const t = Math.max(0, Math.min(1, (dpx * dx + dpy * dy) / (dx * dx + dy * dy)));

            // Closest point on segment
            const closestPoint: LatLng = {
                lat: segmentStart.lat + t * dy,
                lng: segmentStart.lng + t * dx,
            };

            // Return distance to closest point
            return GeoCalculations.calculateDistance(point, closestPoint);
        },
        []
    );

    // Helper function to find nearest edge to a point
    const findNearestEdge = useCallback(
        (clickPosition: LatLng, thresholdMeters: number = 50): EdgeData | null => {
            const nodesByStreet = new Map<string, MapNode[]>();

            nodes.forEach((node) => {
                const existing = nodesByStreet.get(node.streetId) || [];
                existing.push(node);
                nodesByStreet.set(node.streetId, existing);
            });

            let nearestEdge: EdgeData | null = null;
            let minDistance = thresholdMeters;

            nodesByStreet.forEach((streetNodes, streetId) => {
                streetNodes.sort((a, b) => a.vertexIndex - b.vertexIndex);

                for (let i = 0; i < streetNodes.length - 1; i++) {
                    const startNode = streetNodes[i];
                    const endNode = streetNodes[i + 1];

                    // Calculate distance from click point to line segment
                    const distance = calculateDistanceToSegment(
                        clickPosition,
                        startNode.position,
                        endNode.position
                    );

                    if (distance < minDistance) {
                        minDistance = distance;
                        nearestEdge = {
                            id: `${streetId}-${startNode.vertexIndex}-${endNode.vertexIndex}`,
                            streetId,
                            streetName: startNode.streetName,
                            highway: (startNode as any).highway,
                            startNode,
                            endNode,
                        };
                    }
                }
            });

            return nearestEdge;
        },
        [nodes, calculateDistanceToSegment]
    );

    const handleEdgeClick = useCallback(
        (edge: EdgeData, clickPosition: LatLng) => {
            if (editMode !== 'add') return;

            try {
                const result = nodesService.createNode(
                    nodes,
                    edge.streetId,
                    clickPosition,
                    edge.startNode.vertexIndex
                );
                setNodes(result.nodes);
                setHasChanges(true);
                // Mark the new node for elevation sync
                const newNode = result.nodes.find(
                    (n) => n.id === result.action.nodeId
                );
                if (newNode) {
                    markModified(newNode.id);
                }
            } catch (error) {
                console.error('Failed to create node:', error);
            }
        },
        [editMode, nodes, nodesService, markModified]
    );

    const handleUndo = useCallback(() => {
        const result = nodesService.undo(nodes);
        if (result && result.action) {
            setNodes(result.nodes);
            setHasChanges(true);
        }
    }, [nodes, nodesService]);

    const handleRedo = useCallback(() => {
        const result = nodesService.redo(nodes);
        if (result && result.action) {
            setNodes(result.nodes);
            setHasChanges(true);
        }
    }, [nodes, nodesService]);

    const handleSave = useCallback(async () => {
        if (!project || !originalStreets) return;

        setIsSaving(true);
        try {
            // Sync elevations for modified nodes
            const syncedNodes = await syncElevations(nodes);

            // Apply nodes to streets
            const updatedStreets = nodesService.applyNodesToStreets(originalStreets, syncedNodes);

            // Update project
            await updateProject({
                ...project,
                streets: updatedStreets,
            });

            // Update local state
            setOriginalStreets(updatedStreets);
            setHasChanges(false);
        } catch (error) {
            console.error('Failed to save project:', error);
        } finally {
            setIsSaving(false);
        }
    }, [project, originalStreets, nodes, syncElevations, nodesService, updateProject]);

    const handleExport = useCallback(() => {
        if (!originalStreets || !nodes.length) return;

        // Apply nodes to streets for export
        const exportStreets = nodesService.applyNodesToStreets(originalStreets, nodes);

        // Create download
        const blob = new Blob([JSON.stringify(exportStreets, null, 2)], {
            type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${project?.name || 'project'}-streets.geojson`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, [originalStreets, nodes, nodesService, project?.name]);

    const elevationStats = useMemo(() => {
        if (!project?.streets) return null;
        let min = Infinity;
        let max = -Infinity;
        let hasElevation = false;

        project.streets.features.forEach((f: any) => {
            const elev = f.properties?.elevation;
            if (elev) {
                if (elev.min < min) min = elev.min;
                if (elev.max > max) max = elev.max;
                hasElevation = true;
            }
        });

        return hasElevation ? { min, max } : null;
    }, [project]);

    const canUndo = nodesService.canUndo();
    const canRedo = nodesService.canRedo();

    if (!isMounted || isLoading) {
        return (
            <div className="flex h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
                <div className="flex flex-col items-center gap-4">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
                    <div className="text-zinc-500">
                        {isLoading ? 'Loading project data...' : 'Initializing...'}
                    </div>
                </div>
            </div>
        );
    }

    if (!project) {
        return (
            <div className="flex h-screen flex-col items-center justify-center gap-4 bg-zinc-50 dark:bg-zinc-950">
                <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                    Project not found
                </h1>
                <button
                    onClick={() => router.push('/projects')}
                    className="text-blue-600 hover:underline"
                >
                    Back to Projects
                </button>
            </div>
        );
    }

    const handleDelete = async () => {
        await deleteProject(project.id);
        router.push('/projects');
    };

    return (
        <div className="flex h-screen flex-col overflow-hidden bg-zinc-50 dark:bg-zinc-950">
            {/* Header */}
            <header className="flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => router.push('/projects')}
                        className="rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                        <ArrowLeft className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
                    </button>
                    <div>
                        <h1 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                            {project.name}
                        </h1>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                            Created {new Date(project.createdAt).toLocaleDateString()}
                            {hasChanges && (
                                <span className="ml-2 text-amber-500">* Unsaved changes</span>
                            )}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {/* Edit Mode Controls */}
                    <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1 mr-2">
                        <button
                            onClick={() => setEditMode('move')}
                            className={`px-3 py-1 text-xs rounded-md transition-colors ${
                                editMode === 'move'
                                    ? 'bg-white shadow text-black dark:bg-zinc-600 dark:text-white'
                                    : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                            }`}
                        >
                            Move
                        </button>
                        <button
                            onClick={() => setEditMode('delete')}
                            className={`px-3 py-1 text-xs rounded-md transition-colors ${
                                editMode === 'delete'
                                    ? 'bg-white shadow text-red-600 dark:bg-red-900/30 dark:text-red-400'
                                    : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                            }`}
                        >
                            Delete
                        </button>
                        <button
                            onClick={() => setEditMode('add')}
                            className={`px-3 py-1 text-xs rounded-md transition-colors ${
                                editMode === 'add'
                                    ? 'bg-white shadow text-green-600 dark:bg-green-900/30 dark:text-green-400'
                                    : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                            }`}
                        >
                            Add
                        </button>
                    </div>

                    {/* Undo/Redo */}
                    <div className="flex gap-1 mr-2">
                        <button
                            onClick={handleUndo}
                            disabled={!canUndo}
                            className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30"
                            title="Undo (Ctrl+Z)"
                        >
                            <Undo2 className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
                        </button>
                        <button
                            onClick={handleRedo}
                            disabled={!canRedo}
                            className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30"
                            title="Redo (Ctrl+Shift+Z)"
                        >
                            <Redo2 className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
                        </button>
                    </div>

                    {/* Save Button */}
                    <button
                        onClick={handleSave}
                        disabled={isSaving || !hasChanges}
                        className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                        <Save className="h-4 w-4" />
                        {isSaving ? 'Saving...' : 'Save'}
                    </button>

                    {/* Graph Processing Button */}
                    <button
                        onClick={() => setIsGraphProcessingOpen(true)}
                        className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        title="Processar Grafo"
                    >
                        <Network className="h-4 w-4" />
                        Processar
                    </button>

                    {/* Export Button */}
                    <button
                        onClick={handleExport}
                        className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                        <Download className="h-4 w-4" />
                        Export
                    </button>

                    {/* Delete Button */}
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <button className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30">
                                <Trash2 className="h-4 w-4" />
                                Delete
                            </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This action cannot be undone. This will permanently delete
                                    your project and remove your data from our servers.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={handleDelete}
                                    className="bg-red-600 text-white hover:bg-red-700 dark:bg-red-900 dark:text-white dark:hover:bg-red-800"
                                >
                                    Delete
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            </header>

            {/* Main Content */}
            <div className="flex flex-1 overflow-hidden">
                {/* Map View (Left - 70%) */}
                <div className="relative flex-1 bg-zinc-200 dark:bg-zinc-800">
                    <MapContainer
                        center={project.center}
                        zoom={project.zoom}
                        preferCanvas
                        className="h-full w-full"
                        style={{ background: 'transparent' }}
                    >
                        <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png"
                        />
                        <Rectangle
                            bounds={[
                                [project.bounds.southWest.lat, project.bounds.southWest.lng],
                                [project.bounds.northEast.lat, project.bounds.northEast.lng],
                            ]}
                            pathOptions={{
                                color: '#2563eb',
                                fillColor: 'transparent',
                                weight: 2,
                            }}
                        />
                        {nodes.length > 0 && (
                            <MapContent
                                nodes={nodes}
                                setNodes={setNodes}
                                editMode={editMode}
                                selectedIds={selectedIds}
                                hoveredId={hoveredId}
                                onNodeClick={handleNodeClick}
                                onNodeHover={handleNodeHover}
                                onModifiedNode={handleModifiedNode}
                                onEdgeClick={handleEdgeClick}
                                findNearestEdge={findNearestEdge}
                            />
                        )}
                    </MapContainer>

                    {/* Overlay Stats */}
                    <div className="absolute top-4 left-4 z-[1000] flex flex-col gap-2">
                        <div className="rounded-lg bg-white/90 px-3 py-2 shadow-sm backdrop-blur-sm dark:bg-zinc-900/90">
                            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                                Area: {project.areaKm2.toFixed(2)} km²
                            </span>
                        </div>
                        <div className="rounded-lg bg-white/90 px-3 py-2 shadow-sm backdrop-blur-sm dark:bg-zinc-900/90">
                            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                                {nodes.length} nodes | {selectedIds.length} selected
                            </span>
                        </div>
                    </div>
                </div>

                {/* Data Inspector (Right - 30%) */}
                <div className="w-80 border-l border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                    <div className="flex border-b border-zinc-200 dark:border-zinc-800">
                        <button
                            onClick={() => setActiveTab('overview')}
                            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                                activeTab === 'overview'
                                    ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400'
                                    : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
                            }`}
                        >
                            Overview
                        </button>
                        <button
                            onClick={() => setActiveTab('streets')}
                            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                                activeTab === 'streets'
                                    ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400'
                                    : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
                            }`}
                        >
                            Streets
                        </button>
                    </div>

                    <div className="p-4">
                        {activeTab === 'overview' && (
                            <div className="space-y-6">
                                <div>
                                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                                        Project Stats
                                    </h3>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/50">
                                            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                                Total Streets
                                            </p>
                                            <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">
                                                {project.stats.streetCount}
                                            </p>
                                        </div>
                                        <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/50">
                                            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                                Total Nodes
                                            </p>
                                            <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">
                                                {nodes.length}
                                            </p>
                                        </div>
                                        <div className="col-span-2 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/50">
                                            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                                Elevation (Min - Max)
                                            </p>
                                            <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">
                                                {elevationStats &&
                                                elevationStats.min != null &&
                                                elevationStats.max != null
                                                    ? `${elevationStats.min.toFixed(0)}m - ${elevationStats.max.toFixed(0)}m`
                                                    : '-'}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                                        Center Coordinates
                                    </h3>
                                    <div className="rounded-lg bg-zinc-50 p-3 font-mono text-xs text-zinc-600 dark:bg-zinc-800/50 dark:text-zinc-300">
                                        {project.center[0].toFixed(5)}, {project.center[1].toFixed(5)}
                                    </div>
                                </div>

                                {selectedIds.length > 0 && (
                                    <div>
                                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                                            Selected Nodes
                                        </h3>
                                        <div className="space-y-2">
                                            {selectedIds.slice(0, 5).map((id) => {
                                                const node = nodes.find((n) => n.id === id);
                                                if (!node) return null;
                                                return (
                                                    <div
                                                        key={id}
                                                        className="rounded-lg bg-blue-50 p-2 text-xs dark:bg-blue-900/20"
                                                    >
                                                        <p className="font-medium text-blue-900 dark:text-blue-100">
                                                            {node.streetName || 'Unnamed'}
                                                        </p>
                                                        <p className="text-blue-600 dark:text-blue-400">
                                                            Elev:{' '}
                                                            {node.elevation?.toFixed(1) ?? 'N/A'}m
                                                        </p>
                                                    </div>
                                                );
                                            })}
                                            {selectedIds.length > 5 && (
                                                <p className="text-xs text-zinc-500">
                                                    +{selectedIds.length - 5} more
                                                </p>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => setSelectedIds([])}
                                            className="mt-2 w-full rounded-lg bg-zinc-200 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-300"
                                        >
                                            Clear Selection
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'streets' && (
                            <div className="space-y-4">
                                <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                                    Highway Legend
                                </h3>
                                <div className="space-y-2">
                                    {Object.entries(HIGHWAY_COLORS).map(([type, color]) => (
                                        <div
                                            key={type}
                                            className="flex items-center justify-between rounded-lg border border-zinc-100 p-2 dark:border-zinc-800"
                                        >
                                            <span className="text-xs capitalize text-zinc-600 dark:text-zinc-400">
                                                {type}
                                            </span>
                                            <div
                                                className="h-3 w-3 rounded-full"
                                                style={{ backgroundColor: color }}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Graph Processing Panel */}
            <GraphProcessingPanel
                streets={originalStreets}
                nodes={nodes}
                open={isGraphProcessingOpen}
                onOpenChange={setIsGraphProcessingOpen}
                onApply={({ streets, nodes: processedNodes }) => {
                    setOriginalStreets(streets);
                    setNodes(processedNodes);
                    setHasChanges(true);
                }}
            />
        </div>
    );
}
