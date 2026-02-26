/**
 * Camada de Nós do Mapa
 *
 * Renderiza e gerencia interatividade com nós (vértices de ruas)
 * Otimizado com React.memo para evitar re-renders desnecessários
 */

'use client';

import { useEffect, useRef, useCallback, useMemo, memo } from 'react';
import type * as Leaflet from 'leaflet';
import type { MapNode, LatLng, NodeEditMode } from '../types';
import { NODE_STYLES } from '../constants';
import { useLeaflet } from '../hooks/useLeaflet';

interface NodesLayerProps {
    mapInstance: Leaflet.Map | null;
    nodes: MapNode[];
    selectedIds: string[];
    hoveredId: string | null;
    dragPosition: LatLng | null;
    draggedNodeId: string | null;
    editMode?: NodeEditMode;
    editable?: boolean;
    dragRequiresSelection?: boolean;
    showElevation?: boolean;
    showEndpoints?: boolean;
    showIntersections?: boolean;
    onNodeClick?: (node: MapNode, event: { shiftKey: boolean; ctrlKey: boolean }) => void;
    onNodeHover?: (nodeId: string | null) => void;
    onDragStart?: (nodeId: string) => void;
    onDoubleClick?: (node: MapNode) => void;
}

/**
 * NodesLayer Component
 *
 * Optimized for performance with:
 * - React.memo with custom comparison
 * - Stable callbacks with useCallback
 * - Efficient marker updates
 */
function NodesLayerComponent({
    mapInstance,
    nodes,
    selectedIds,
    hoveredId,
    dragPosition,
    draggedNodeId,
    editMode = 'none',
    editable = false,
    dragRequiresSelection = true,
    showElevation = true,
    showEndpoints = true,
    showIntersections = true,
    onNodeClick,
    onNodeHover,
    onDragStart,
    onDoubleClick,
}: NodesLayerProps) {
    const layerRef = useRef<Leaflet.LayerGroup | null>(null);
    const markersRef = useRef<Map<string, Leaflet.CircleMarker>>(new Map());
    const leaflet = useLeaflet();

    // Convert selectedIds to Set for fast lookup
    const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

    // Determine node style
    const getNodeStyle = useCallback(
        (
            node: MapNode,
            isSelected: boolean,
            isHovered: boolean,
            isBeingDragged: boolean
        ): Leaflet.CircleMarkerOptions => {
            let style = NODE_STYLES.default;

            // Style priority (lowest to highest)
            if (node.isEndpoint && showEndpoints) {
                style = NODE_STYLES.endpoint;
            }

            // Base: intersection style (all backend nodes are degree > 2)
            if (node.isIntersection && showIntersections) {
                style = NODE_STYLES.intersection;
            }

            // Elevation extremes (higher priority than base intersection)
            if (node.isLowestElevation) {
                style = NODE_STYLES.lowestElevation;
            }
            if (node.isHighestElevation) {
                style = NODE_STYLES.highestElevation;
            }

            // Interaction states (highest priority)
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
                weight: isSelected ? 3 : 2,
            };
        },
        [showEndpoints, showIntersections]
    );

    // Create/update nodes layer
    useEffect(() => {
        if (!mapInstance || !leaflet) return;

        const L = leaflet;

        // Remove previous layer
        if (layerRef.current) {
            layerRef.current.remove();
        }

        // Create new layer
        layerRef.current = L.layerGroup().addTo(mapInstance);
        markersRef.current.clear();

        // Separate nodes: regular nodes vs dragged node
        const regularNodes = nodes.filter((n) => n.id !== draggedNodeId);
        const draggedNode = nodes.find((n) => n.id === draggedNodeId);

        // Add markers for regular nodes first
        regularNodes.forEach((node) => {
            const isSelected = selectedIdSet.has(node.id);
            const isHovered = node.id === hoveredId;

            const style = getNodeStyle(node, isSelected, isHovered, false);

            const marker = L.circleMarker([node.position.lat, node.position.lng], style);

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

            // Event handlers if editable
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

                // Drag handlers (only start if already selected and mode is 'move')
                if (editMode === 'move' || editMode === 'select') {
                    marker.on('mousedown', (e) => {
                        if ((!dragRequiresSelection || isSelected) && !node.isLocked) {
                            L.DomEvent.stopPropagation(e);
                            onDragStart?.(node.id);
                        }
                    });
                }

                // Cursor based on mode
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

        // Add dragged node last (renders on top)
        if (draggedNode && dragPosition) {
            const isSelected = selectedIdSet.has(draggedNode.id);
            const style = getNodeStyle(draggedNode, isSelected, false, true);

            const marker = L.circleMarker([dragPosition.lat, dragPosition.lng], style);

            // Dragging tooltip
            marker.bindTooltip(`Moving...`, {
                permanent: true,
                direction: 'top',
                offset: [0, -10],
                className: 'node-tooltip dragging',
            });

            marker.addTo(layerRef.current!);
            markersRef.current.set(draggedNode.id, marker);
        }

        // Cleanup
        return () => {
            layerRef.current?.remove();
        };
    }, [
        mapInstance,
        leaflet,
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
 * Build tooltip content
 */
function buildTooltipContent(node: MapNode, showElevation: boolean): string {
    const parts: string[] = [];

    // Elevation
    if (showElevation && node.elevation !== null) {
        parts.push(`${node.elevation.toFixed(1)}m`);
    }

    // Street name
    if (node.streetName && node.streetName !== 'Unnamed') {
        parts.push(node.streetName);
    }

    // Degree info
    if (node.isIntersection && node.degree) {
        parts.push(`Interseção (${node.degree} ruas)`);
    }

    // Badges
    const badges: string[] = [];
    if (node.isHighestElevation) badges.push('MAIOR ELEVAÇÃO');
    if (node.isLowestElevation) badges.push('MENOR ELEVAÇÃO');
    if (node.isEndpoint) badges.push('Endpoint');
    if (node.isLocked) badges.push('Locked');

    if (badges.length > 0) {
        parts.push(`[${badges.join(', ')}]`);
    }

    return parts.join(' | ');
}

/**
 * Custom comparison function for React.memo
 * Only re-render when relevant props change
 */
function arePropsEqual(prevProps: NodesLayerProps, nextProps: NodesLayerProps): boolean {
    // Always re-render if map instance changes
    if (prevProps.mapInstance !== nextProps.mapInstance) return false;

    // Compare primitive values
    if (prevProps.hoveredId !== nextProps.hoveredId) return false;
    if (prevProps.draggedNodeId !== nextProps.draggedNodeId) return false;
    if (prevProps.editMode !== nextProps.editMode) return false;
    if (prevProps.editable !== nextProps.editable) return false;
    if (prevProps.dragRequiresSelection !== nextProps.dragRequiresSelection) return false;
    if (prevProps.showElevation !== nextProps.showElevation) return false;
    if (prevProps.showEndpoints !== nextProps.showEndpoints) return false;
    if (prevProps.showIntersections !== nextProps.showIntersections) return false;

    // Compare drag position
    if (prevProps.dragPosition !== nextProps.dragPosition) {
        if (!prevProps.dragPosition || !nextProps.dragPosition) return false;
        if (
            prevProps.dragPosition.lat !== nextProps.dragPosition.lat ||
            prevProps.dragPosition.lng !== nextProps.dragPosition.lng
        ) {
            return false;
        }
    }

    // Compare nodes array (reference equality first, then length)
    if (prevProps.nodes !== nextProps.nodes) {
        if (prevProps.nodes.length !== nextProps.nodes.length) return false;
        // Deep comparison would be too expensive, rely on reference
        return false;
    }

    // Compare selectedIds array
    if (prevProps.selectedIds !== nextProps.selectedIds) {
        if (prevProps.selectedIds.length !== nextProps.selectedIds.length) return false;
        const prevSet = new Set(prevProps.selectedIds);
        const nextSet = new Set(nextProps.selectedIds);
        for (const id of prevSet) {
            if (!nextSet.has(id)) return false;
        }
    }

    // Callbacks comparison (by reference)
    if (prevProps.onNodeClick !== nextProps.onNodeClick) return false;
    if (prevProps.onNodeHover !== nextProps.onNodeHover) return false;
    if (prevProps.onDragStart !== nextProps.onDragStart) return false;
    if (prevProps.onDoubleClick !== nextProps.onDoubleClick) return false;

    return true;
}

/**
 * Memoized NodesLayer component
 */
export const NodesLayer = memo(NodesLayerComponent, arePropsEqual);

/**
 * Export the non-memoized version for cases where memo is not needed
 */
export { NodesLayerComponent };
