/**
 * MapContext - Contexto global do mapa
 *
 * Gerencia todo o estado do mapa de forma centralizada
 */

'use client';

import {
    createContext,
    useContext,
    useReducer,
    useCallback,
    useMemo,
    useRef,
    type ReactNode,
} from 'react';
import type L from 'leaflet';
import type { LatLng, BoundingBox, ViewMode, NodeEditMode, MapNode } from '../types';
import { ElevationService } from '../services/ElevationService';
import { NodesService } from '../services/NodesService';
import { NodesApiService } from '../services/NodesApiService';
import { StreetsService } from '../services/StreetsService';
import {
    type MapContextValue,
    type MapState,
    initialMapState,
    mapReducer,
} from './MapContext.types';

// ============ CONTEXT ============

const MapContext = createContext<MapContextValue | null>(null);

// ============ PROVIDER PROPS ============

interface MapProviderProps {
    children: ReactNode;
    initialCenter?: [number, number];
    initialZoom?: number;
    onBboxChange?: (bbox: BoundingBox | null) => void;
    onStreetsLoaded?: (geojson: GeoJSON.FeatureCollection) => void;
    onError?: (error: Error) => void;
}

// ============ PROVIDER ============

export function MapProvider({
    children,
    initialCenter,
    initialZoom,
    onBboxChange,
    onStreetsLoaded,
    onError,
}: MapProviderProps) {
    // Services (singletons)
    const elevationService = ElevationService.getInstance();
    const nodesService = NodesService.getInstance();
    const nodesApiService = NodesApiService.getInstance();
    const streetsService = StreetsService.getInstance();

    // Initial state with overrides
    const initialState: MapState = {
        ...initialMapState,
        center: initialCenter ?? initialMapState.center,
        zoom: initialZoom ?? initialMapState.zoom,
    };

    // Reducer
    const [state, dispatch] = useReducer(mapReducer, initialState);

    // Refs for callbacks
    const stateRef = useRef(state);
    stateRef.current = state;

    // ============ MAP INSTANCE ACTIONS ============

    const setMap = useCallback((map: L.Map | null) => {
        dispatch({ type: 'SET_MAP', payload: map });
    }, []);

    const setIsReady = useCallback((ready: boolean) => {
        dispatch({ type: 'SET_IS_READY', payload: ready });
    }, []);

    // ============ VIEW MODE ACTIONS ============

    const setViewMode = useCallback((mode: ViewMode) => {
        dispatch({ type: 'SET_VIEW_MODE', payload: mode });
    }, []);

    // ============ BOUNDING BOX ACTIONS ============

    const setPendingBbox = useCallback((bbox: BoundingBox | null, area?: number) => {
        dispatch({ type: 'SET_PENDING_BBOX', payload: { bbox, area } });
    }, []);

    const confirmBbox = useCallback(() => {
        dispatch({ type: 'CONFIRM_BBOX' });
        const bbox = stateRef.current.pendingBbox;
        if (bbox) {
            onBboxChange?.(bbox);
        }
    }, [onBboxChange]);

    const cancelBbox = useCallback(() => {
        dispatch({ type: 'CANCEL_BBOX' });
    }, []);

    const clearBbox = useCallback(() => {
        dispatch({ type: 'CLEAR_BBOX' });
        nodesService.clearHistory();
        onBboxChange?.(null);
    }, [nodesService, onBboxChange]);

    // ============ POSITION ACTIONS ============

    const setPosition = useCallback((center: [number, number], zoom: number) => {
        dispatch({ type: 'SET_POSITION', payload: { center, zoom } });
    }, []);

    // ============ PROCESSING ACTIONS ============

    const startProcessing = useCallback(async () => {
        const { activeBbox } = stateRef.current;
        if (!activeBbox) return;

        dispatch({ type: 'SET_PROCESSING', payload: true });
        dispatch({ type: 'SET_STAGES', payload: { streets: 'loading' } });

        try {
            // 1. Fetch streets
            const streetsResult = await streetsService.fetchStreets(activeBbox);
            dispatch({ type: 'SET_STREETS_DATA', payload: streetsResult.geojson });
            dispatch({ type: 'SET_STAGES', payload: { streets: 'success' } });
            onStreetsLoaded?.(streetsResult.geojson);

            // 2. Enrich with elevation (server-side: Python + rasterio)
            dispatch({ type: 'SET_STAGES', payload: { topography: 'loading' } });
            const enrichedStreets = await elevationService.fetchEnrichedGeoJSON(
                streetsResult.geojson,
                activeBbox,
            );
            dispatch({ type: 'SET_STAGES', payload: { topography: 'success' } });
            dispatch({ type: 'SET_STREETS_DATA', payload: enrichedStreets });

            // 3. Extract nodes via backend (only intersections with degree > 2)
            dispatch({ type: 'SET_STAGES', payload: { nodes: 'loading' } });
            const { nodes: extractedNodes } = await nodesApiService.extractNodes(enrichedStreets);
            dispatch({ type: 'SET_NODES', payload: extractedNodes });
            dispatch({ type: 'SET_STAGES', payload: { nodes: 'success' } });
        } catch (error) {
            const err = error instanceof Error ? error : new Error('Erro desconhecido');
            onError?.(err);

            const { stages } = stateRef.current;
            if (stages.streets !== 'success') {
                dispatch({ type: 'SET_STAGES', payload: { streets: 'error' } });
                dispatch({ type: 'SET_ERRORS', payload: { streets: err.message } });
            } else if (stages.topography !== 'success') {
                dispatch({ type: 'SET_STAGES', payload: { topography: 'error' } });
                dispatch({ type: 'SET_ERRORS', payload: { topography: err.message } });
            } else {
                dispatch({ type: 'SET_STAGES', payload: { nodes: 'error' } });
                dispatch({ type: 'SET_ERRORS', payload: { nodes: err.message } });
            }
        } finally {
            dispatch({ type: 'SET_PROCESSING', payload: false });
        }
    }, [streetsService, elevationService, nodesApiService, onStreetsLoaded, onError]);

    const cancelProcessing = useCallback(() => {
        dispatch({ type: 'SET_PROCESSING', payload: false });
    }, []);

    // ============ NODE ACTIONS ============

    const setNodes = useCallback((nodes: MapNode[]) => {
        dispatch({ type: 'SET_NODES', payload: nodes });
    }, []);

    const setNodeEditMode = useCallback((mode: NodeEditMode) => {
        dispatch({ type: 'SET_NODE_EDIT_MODE', payload: mode });
    }, []);

    const selectNode = useCallback((nodeId: string, addToSelection = false) => {
        const { nodes, selectedNodeIds } = stateRef.current;
        let newSelected: string[];

        if (addToSelection) {
            newSelected = selectedNodeIds.includes(nodeId)
                ? selectedNodeIds.filter((id) => id !== nodeId)
                : [...selectedNodeIds, nodeId];
        } else {
            newSelected = [nodeId];
        }

        dispatch({ type: 'SET_SELECTED_NODE_IDS', payload: newSelected });

        // Update node state
        const updatedNodes = nodes.map((n) => ({
            ...n,
            isSelected: newSelected.includes(n.id),
        }));
        dispatch({ type: 'SET_NODES', payload: updatedNodes });
    }, []);

    const selectNodes = useCallback((nodeIds: string[]) => {
        dispatch({ type: 'SET_SELECTED_NODE_IDS', payload: nodeIds });

        const { nodes } = stateRef.current;
        const idSet = new Set(nodeIds);
        const updatedNodes = nodes.map((n) => ({
            ...n,
            isSelected: idSet.has(n.id),
        }));
        dispatch({ type: 'SET_NODES', payload: updatedNodes });
    }, []);

    const clearSelection = useCallback(() => {
        dispatch({ type: 'SET_SELECTED_NODE_IDS', payload: [] });

        const { nodes } = stateRef.current;
        const updatedNodes = nodes.map((n) => ({
            ...n,
            isSelected: false,
            isHovered: false,
        }));
        dispatch({ type: 'SET_NODES', payload: updatedNodes });
    }, []);

    const setHoveredNode = useCallback((nodeId: string | null) => {
        dispatch({ type: 'SET_HOVERED_NODE_ID', payload: nodeId });

        const { nodes } = stateRef.current;
        const updatedNodes = nodes.map((n) => ({
            ...n,
            isHovered: n.id === nodeId,
        }));
        dispatch({ type: 'SET_NODES', payload: updatedNodes });
    }, []);

    const moveNode = useCallback(async (nodeId: string, position: LatLng) => {
        const { nodes, activeBbox } = stateRef.current;

        try {
            const node = nodes.find((n) => n.id === nodeId);
            if (!node) return;

            // Validate if bbox available
            if (activeBbox) {
                const validation = nodesService.validateMove(node, position, nodes, activeBbox);
                if (!validation.valid) {
                    dispatch({ type: 'SET_VALIDATION_ERROR', payload: validation.errors[0]?.message ?? 'Movimento inválido' });
                    return;
                }
            }

            const result = nodesService.moveNode(nodes, nodeId, position);
            dispatch({ type: 'SET_NODES', payload: result.nodes });
        } catch (error) {
            onError?.(error instanceof Error ? error : new Error('Erro ao mover nó'));
        }
    }, [nodesService, onError]);

    const deleteNode = useCallback((nodeId: string) => {
        const { nodes } = stateRef.current;

        try {
            const result = nodesService.deleteNode(nodes, nodeId);
            dispatch({ type: 'SET_NODES', payload: result.nodes });
            dispatch({ type: 'SET_SELECTED_NODE_IDS', payload: [] });
        } catch (error) {
            onError?.(error instanceof Error ? error : new Error('Erro ao deletar nó'));
        }
    }, [nodesService, onError]);

    const deleteSelected = useCallback(() => {
        const { nodes, selectedNodeIds } = stateRef.current;

        try {
            const result = nodesService.deleteNodes(nodes, selectedNodeIds);
            dispatch({ type: 'SET_NODES', payload: result.nodes });
            dispatch({ type: 'SET_SELECTED_NODE_IDS', payload: [] });
        } catch (error) {
            onError?.(error instanceof Error ? error : new Error('Erro ao deletar nós'));
        }
    }, [nodesService, onError]);

    const undo = useCallback(() => {
        const { nodes } = stateRef.current;
        const result = nodesService.undo(nodes);
        if (result.action) {
            dispatch({ type: 'SET_NODES', payload: result.nodes });
        }
    }, [nodesService]);

    const redo = useCallback(() => {
        const { nodes } = stateRef.current;
        const result = nodesService.redo(nodes);
        if (result.action) {
            dispatch({ type: 'SET_NODES', payload: result.nodes });
        }
    }, [nodesService]);

    // ============ DATA ACTIONS ============

    const setStreetsData = useCallback((data: GeoJSON.FeatureCollection | null) => {
        dispatch({ type: 'SET_STREETS_DATA', payload: data });
    }, []);

    const enrichStreetsWithElevation = useCallback(async () => {
        const { streetsData, activeBbox } = stateRef.current;
        if (!streetsData || !activeBbox) return;

        const enriched = await elevationService.fetchEnrichedGeoJSON(streetsData, activeBbox);
        dispatch({ type: 'SET_STREETS_DATA', payload: enriched });
    }, [elevationService]);

    const applyNodeChanges = useCallback((): GeoJSON.FeatureCollection | null => {
        const { streetsData, nodes } = stateRef.current;
        if (!streetsData) return null;

        return nodesService.applyNodesToStreets(streetsData, nodes);
    }, [nodesService]);

    // ============ UI ACTIONS ============

    const setShowCropConfirm = useCallback((show: boolean) => {
        dispatch({ type: 'SET_SHOW_CROP_CONFIRM', payload: show });
    }, []);

    const setShowSaveDialog = useCallback((show: boolean) => {
        dispatch({ type: 'SET_SHOW_SAVE_DIALOG', payload: show });
    }, []);

    const setValidationError = useCallback((error: string | null) => {
        dispatch({ type: 'SET_VALIDATION_ERROR', payload: error });
    }, []);

    // ============ RESET ============

    const reset = useCallback(() => {
        dispatch({ type: 'RESET' });
        nodesService.clearHistory();
    }, [nodesService]);

    // ============ CONTEXT VALUE ============

    const value: MapContextValue = useMemo(
        () => ({
            // State
            ...state,

            // Actions
            setMap,
            setIsReady,
            setViewMode,
            setPendingBbox,
            confirmBbox,
            cancelBbox,
            clearBbox,
            setPosition,
            startProcessing,
            cancelProcessing,
            setNodes,
            setNodeEditMode,
            selectNode,
            selectNodes,
            clearSelection,
            setHoveredNode,
            moveNode,
            deleteNode,
            deleteSelected,
            undo,
            redo,
            setStreetsData,
            enrichStreetsWithElevation,
            applyNodeChanges,
            setShowCropConfirm,
            setShowSaveDialog,
            setValidationError,
            reset,
        }),
        [
            state,
            setMap,
            setIsReady,
            setViewMode,
            setPendingBbox,
            confirmBbox,
            cancelBbox,
            clearBbox,
            setPosition,
            startProcessing,
            cancelProcessing,
            setNodes,
            setNodeEditMode,
            selectNode,
            selectNodes,
            clearSelection,
            setHoveredNode,
            moveNode,
            deleteNode,
            deleteSelected,
            undo,
            redo,
            setStreetsData,
            enrichStreetsWithElevation,
            applyNodeChanges,
            setShowCropConfirm,
            setShowSaveDialog,
            setValidationError,
            reset,
        ]
    );

    return <MapContext.Provider value={value}>{children}</MapContext.Provider>;
}

// ============ HOOK ============

export function useMapContext(): MapContextValue {
    const context = useContext(MapContext);
    if (!context) {
        throw new Error('useMapContext must be used within a MapProvider');
    }
    return context;
}

// ============ SELECTOR HOOKS ============

/**
 * Hook para acessar apenas o estado (sem ações)
 */
export function useMapState() {
    const context = useMapContext();
    return {
        map: context.map,
        isReady: context.isReady,
        viewMode: context.viewMode,
        pendingBbox: context.pendingBbox,
        activeBbox: context.activeBbox,
        bboxArea: context.bboxArea,
        center: context.center,
        zoom: context.zoom,
        isProcessing: context.isProcessing,
        stages: context.stages,
        errors: context.errors,
        streetsData: context.streetsData,
        streetCount: context.streetCount,
        nodes: context.nodes,
        nodeEditMode: context.nodeEditMode,
        selectedNodeIds: context.selectedNodeIds,
        hoveredNodeId: context.hoveredNodeId,
        showCropConfirm: context.showCropConfirm,
        showSaveDialog: context.showSaveDialog,
        validationError: context.validationError,
    };
}

/**
 * Hook para acessar apenas as ações de bbox
 */
export function useBboxActions() {
    const context = useMapContext();
    return {
        setPendingBbox: context.setPendingBbox,
        confirmBbox: context.confirmBbox,
        cancelBbox: context.cancelBbox,
        clearBbox: context.clearBbox,
    };
}

/**
 * Hook para acessar apenas as ações de nós
 */
export function useNodeActions() {
    const context = useMapContext();
    return {
        setNodes: context.setNodes,
        setNodeEditMode: context.setNodeEditMode,
        selectNode: context.selectNode,
        selectNodes: context.selectNodes,
        clearSelection: context.clearSelection,
        setHoveredNode: context.setHoveredNode,
        moveNode: context.moveNode,
        deleteNode: context.deleteNode,
        deleteSelected: context.deleteSelected,
        undo: context.undo,
        redo: context.redo,
    };
}

/**
 * Hook para acessar apenas as ações de processamento
 */
export function useProcessingActions() {
    const context = useMapContext();
    return {
        startProcessing: context.startProcessing,
        cancelProcessing: context.cancelProcessing,
        enrichStreetsWithElevation: context.enrichStreetsWithElevation,
        applyNodeChanges: context.applyNodeChanges,
    };
}
