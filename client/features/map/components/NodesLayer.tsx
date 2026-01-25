/**
 * Camada de Nós do Mapa
 *
 * Renderiza e gerencia interatividade com nós (vértices de ruas)
 */

'use client';

import { useEffect, useRef, useCallback, useMemo } from 'react';
import L from 'leaflet';
import type { MapNode, LatLng, NodeEditMode } from '../types';
import { NODE_STYLES } from '../constants';

interface NodesLayerProps {
    mapInstance: L.Map | null;
    nodes: MapNode[];
    selectedIds: string[];
    hoveredId: string | null;
    dragPosition: LatLng | null;
    draggedNodeId: string | null;
    editMode?: NodeEditMode;
    editable?: boolean;
    showElevation?: boolean;
    showEndpoints?: boolean;
    showIntersections?: boolean;
    onNodeClick?: (node: MapNode, event: { shiftKey: boolean; ctrlKey: boolean }) => void;
    onNodeHover?: (nodeId: string | null) => void;
    onDragStart?: (nodeId: string) => void;
    onDoubleClick?: (node: MapNode) => void;
}

export function NodesLayer({
    mapInstance,
    nodes,
    selectedIds,
    hoveredId,
    dragPosition,
    draggedNodeId,
    editMode = 'none',
    editable = false,
    showElevation = true,
    showEndpoints = true,
    showIntersections = true,
    onNodeClick,
    onNodeHover,
    onDragStart,
    onDoubleClick,
}: NodesLayerProps) {
    const layerRef = useRef<L.LayerGroup | null>(null);
    const markersRef = useRef<Map<string, L.CircleMarker>>(new Map());

    // Converter selectedIds para Set para lookup rápido
    const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

    // Determina estilo do nó
    const getNodeStyle = useCallback(
        (node: MapNode, isSelected: boolean, isHovered: boolean, isBeingDragged: boolean): L.CircleMarkerOptions => {
            let style = NODE_STYLES.default;

            // Prioridade de estilos (do menor para o maior)
            if (node.isEndpoint && showEndpoints) {
                style = NODE_STYLES.endpoint;
            }

            if (node.isIntersection && showIntersections) {
                // Usar cor de endpoint para interseções também (ou criar estilo próprio)
                style = NODE_STYLES.endpoint;
            }

            if (isHovered) {
                style = NODE_STYLES.hovered;
            }

            if (isSelected) {
                style = NODE_STYLES.selected;
            }

            if (isBeingDragged) {
                style = NODE_STYLES.dragging;
            }

            if (node.isLocked) {
                // Estilo para nós bloqueados - usar cor mais escura
                return {
                    radius: style.radius,
                    color: '#374151', // gray-700
                    fillColor: '#374151',
                    fillOpacity: 0.5,
                    weight: 2,
                };
            }

            return {
                radius: style.radius,
                color: style.color,
                fillColor: style.color,
                fillOpacity: style.fillOpacity,
                weight: 2,
            };
        },
        [showEndpoints, showIntersections]
    );

    // Cria/atualiza camada de nós
    useEffect(() => {
        if (!mapInstance) return;

        // Remove camada anterior
        if (layerRef.current) {
            layerRef.current.remove();
        }

        // Cria nova camada
        layerRef.current = L.layerGroup().addTo(mapInstance);
        markersRef.current.clear();

        // Adiciona marcadores para cada nó
        nodes.forEach((node) => {
            const isSelected = selectedIdSet.has(node.id);
            const isHovered = node.id === hoveredId;
            const isBeingDragged = node.id === draggedNodeId;

            // Determina posição (usa posição de drag se estiver arrastando)
            const position = isBeingDragged && dragPosition ? dragPosition : node.position;

            // Determina estilo
            const style = getNodeStyle(node, isSelected, isHovered, isBeingDragged);

            const marker = L.circleMarker([position.lat, position.lng], style);

            // Tooltip
            const tooltipContent = buildTooltipContent(node, showElevation);
            if (tooltipContent) {
                marker.bindTooltip(tooltipContent, {
                    permanent: false,
                    direction: 'top',
                    offset: [0, -10],
                    className: 'node-tooltip',
                });
            }

            // Event handlers se editável
            if (editable && editMode !== 'none') {
                marker.on('click', (e) => {
                    L.DomEvent.stopPropagation(e);
                    onNodeClick?.(node, {
                        shiftKey: e.originalEvent.shiftKey,
                        ctrlKey: e.originalEvent.ctrlKey || e.originalEvent.metaKey,
                    });
                });

                marker.on('dblclick', (e) => {
                    L.DomEvent.stopPropagation(e);
                    onDoubleClick?.(node);
                });

                marker.on('mouseover', () => onNodeHover?.(node.id));
                marker.on('mouseout', () => onNodeHover?.(null));

                // Drag handlers (só inicia se já está selecionado e modo é 'move')
                if (editMode === 'move' || editMode === 'select') {
                    marker.on('mousedown', (e) => {
                        if (isSelected && !node.isLocked) {
                            L.DomEvent.stopPropagation(e);
                            onDragStart?.(node.id);
                        }
                    });
                }

                // Cursor baseado no modo
                const element = marker.getElement() as HTMLElement | undefined;
                if (element) {
                    switch (editMode) {
                        case 'select':
                            element.style.cursor = 'pointer';
                            break;
                        case 'move':
                            element.style.cursor = isSelected ? 'grab' : 'pointer';
                            break;
                        case 'delete':
                            element.style.cursor = node.isEndpoint || node.isLocked ? 'not-allowed' : 'pointer';
                            break;
                        default:
                            element.style.cursor = 'default';
                    }
                }
            }

            marker.addTo(layerRef.current!);
            markersRef.current.set(node.id, marker);
        });

        // Cleanup
        return () => {
            layerRef.current?.remove();
        };
    }, [
        mapInstance,
        nodes,
        selectedIdSet,
        hoveredId,
        dragPosition,
        draggedNodeId,
        editMode,
        editable,
        showElevation,
        getNodeStyle,
        onNodeClick,
        onNodeHover,
        onDragStart,
        onDoubleClick,
    ]);

    return null;
}

/**
 * Constrói conteúdo do tooltip
 */
function buildTooltipContent(node: MapNode, showElevation: boolean): string {
    const parts: string[] = [];

    // Elevação
    if (showElevation && node.elevation !== null) {
        parts.push(`${node.elevation.toFixed(1)}m`);
    }

    // Nome da rua
    if (node.streetName && node.streetName !== 'Unnamed') {
        parts.push(node.streetName);
    }

    // Badges
    const badges: string[] = [];
    if (node.isEndpoint) badges.push('Endpoint');
    if (node.isIntersection) badges.push('Interseção');
    if (node.isLocked) badges.push('🔒');

    if (badges.length > 0) {
        parts.push(`[${badges.join(', ')}]`);
    }

    return parts.join(' • ');
}
