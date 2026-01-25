/**
 * Exemplo de uso do MapProvider
 *
 * Este arquivo mostra como usar o módulo de mapas refatorado
 */

'use client';

import { MapProvider, useMapContext, useMapKeyboard } from '@/features/map';
import {
    MapControls,
    MapInfoPanel,
    CropConfirmDialog,
    NodesLayer,
    NodeEditor,
    ElevationLegend,
} from '@/features/map';

// Componente interno que usa o contexto
function MapContent() {
    const {
        map,
        nodes,
        selectedNodeIds,
        hoveredNodeId,
        nodeEditMode,
        elevationData,
        stages,
    } = useMapContext();

    // Habilitar atalhos de teclado
    useMapKeyboard();

    // Stats de elevação
    const elevationStats = elevationData ? {
        min: null as number | null,
        max: null as number | null,
        avg: null as number | null,
        count: 0,
    } : null;

    return (
        <div className="relative h-full w-full">
            {/* Container do Mapa (Leaflet seria inicializado aqui) */}
            <div id="map-container" className="h-full w-full" />

            {/* Controles */}
            <MapControls position="top-right" />

            {/* Painel de Info */}
            <MapInfoPanel position="bottom-left" />

            {/* Camada de Nós */}
            {stages.streets === 'success' && (
                <NodesLayer
                    mapInstance={map}
                    nodes={nodes}
                    selectedIds={selectedNodeIds}
                    hoveredId={hoveredNodeId}
                    dragPosition={null}
                    draggedNodeId={null}
                    editMode={nodeEditMode}
                    editable={true}
                />
            )}

            {/* Editor de Nós (quando há seleção) */}
            {selectedNodeIds.length > 0 && (
                <div className="absolute bottom-4 right-4 z-[1000]">
                    <NodeEditorWrapper />
                </div>
            )}

            {/* Legenda de Elevação */}
            {elevationStats && (
                <div className="absolute bottom-4 right-4 z-[1000]">
                    <ElevationLegend stats={elevationStats} />
                </div>
            )}

            {/* Diálogo de Confirmação */}
            <CropConfirmDialog />
        </div>
    );
}

// Wrapper para NodeEditor usando o contexto
function NodeEditorWrapper() {
    const {
        nodes,
        selectedNodeIds,
        nodeEditMode,
        setNodeEditMode,
        clearSelection,
        deleteSelected,
        undo,
        redo,
    } = useMapContext();

    const selectedNodes = nodes.filter((n) => selectedNodeIds.includes(n.id));

    // TODO: Implements canUndo/canRedo via NodesService
    const canUndo = true;
    const canRedo = true;

    return (
        <NodeEditor
            selectedNodes={selectedNodes}
            editMode={nodeEditMode}
            onSetEditMode={setNodeEditMode}
            onClearSelection={clearSelection}
            onDelete={deleteSelected}
            onUndo={undo}
            onRedo={redo}
            onLock={() => { }} // TODO
            onUnlock={() => { }} // TODO
            canUndo={canUndo}
            canRedo={canRedo}
        />
    );
}

// Componente exportado com Provider
export function MapWithProvider() {
    return (
        <MapProvider
            initialCenter={[-23.5505, -46.6333]}
            initialZoom={13}
            onBboxChange={(bbox) => console.log('Bbox changed:', bbox)}
            onStreetsLoaded={(geojson) => console.log('Streets loaded:', geojson.features.length)}
            onError={(error) => console.error('Map error:', error)}
        >
            <MapContent />
        </MapProvider>
    );
}
