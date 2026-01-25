/**
 * Camada de Arestas do Mapa
 *
 * Renderiza as conexões (linhas) entre nós baseado no estado atual dos nós,
 * independente do GeoJSON. Isso permite que as arestas sigam os nós
 * automaticamente durante operações de drag.
 */

'use client';

import { useEffect, useRef, useMemo, useCallback } from 'react';
import L from 'leaflet';
import type { MapNode, LatLng } from '../types';
import { HIGHWAY_COLORS, HIGHWAY_WEIGHTS } from '../constants';

interface Edge {
    id: string;
    streetId: string;
    streetName?: string;
    highway?: string;
    startNode: MapNode;
    endNode: MapNode;
    startPosition: LatLng;
    endPosition: LatLng;
}

interface EdgesLayerProps {
    mapInstance: L.Map | null;
    nodes: MapNode[];
    draggedNodeId: string | null;
    dragPosition: LatLng | null;
    showTooltips?: boolean;
    onEdgeClick?: (edge: Edge) => void;
    onEdgeHover?: (edgeId: string | null) => void;
}

export function EdgesLayer({
    mapInstance,
    nodes,
    draggedNodeId,
    dragPosition,
    showTooltips = true,
    onEdgeClick,
    onEdgeHover,
}: EdgesLayerProps) {
    const layerRef = useRef<L.LayerGroup | null>(null);

    // Group nodes by streetId and sort by vertexIndex
    const nodesByStreet = useMemo(() => {
        const map = new Map<string, MapNode[]>();

        nodes.forEach((node) => {
            const existing = map.get(node.streetId) || [];
            existing.push(node);
            map.set(node.streetId, existing);
        });

        // Sort each street's nodes by vertexIndex
        map.forEach((streetNodes, streetId) => {
            streetNodes.sort((a, b) => a.vertexIndex - b.vertexIndex);
            map.set(streetId, streetNodes);
        });

        return map;
    }, [nodes]);

    // Build edges from consecutive nodes in each street
    const edges = useMemo(() => {
        const result: Edge[] = [];

        nodesByStreet.forEach((streetNodes, streetId) => {
            for (let i = 0; i < streetNodes.length - 1; i++) {
                const startNode = streetNodes[i];
                const endNode = streetNodes[i + 1];

                // Get positions, using drag position if applicable
                const startPosition =
                    startNode.id === draggedNodeId && dragPosition
                        ? dragPosition
                        : startNode.position;

                const endPosition =
                    endNode.id === draggedNodeId && dragPosition
                        ? dragPosition
                        : endNode.position;

                result.push({
                    id: `${streetId}-${startNode.vertexIndex}-${endNode.vertexIndex}`,
                    streetId,
                    streetName: startNode.streetName,
                    highway: (startNode as any).highway,
                    startNode,
                    endNode,
                    startPosition,
                    endPosition,
                });
            }
        });

        return result;
    }, [nodesByStreet, draggedNodeId, dragPosition]);

    // Get edge style based on highway type
    const getEdgeStyle = useCallback((edge: Edge): L.PolylineOptions => {
        const highway = edge.highway || 'default';
        return {
            color: HIGHWAY_COLORS[highway] || HIGHWAY_COLORS.default,
            weight: HIGHWAY_WEIGHTS[highway] || HIGHWAY_WEIGHTS.default,
            opacity: 0.8,
            lineCap: 'round',
            lineJoin: 'round',
        };
    }, []);

    // Build tooltip content
    const buildTooltipContent = useCallback((edge: Edge): string => {
        const parts: string[] = [];

        if (edge.streetName && edge.streetName !== 'Unnamed') {
            parts.push(`<strong>${edge.streetName}</strong>`);
        }

        if (edge.highway) {
            parts.push(`<span style="color: ${HIGHWAY_COLORS[edge.highway] || '#666'}">${edge.highway}</span>`);
        }

        // Calculate average elevation if both nodes have elevation
        if (edge.startNode.elevation !== null && edge.endNode.elevation !== null) {
            const avgElevation = (edge.startNode.elevation + edge.endNode.elevation) / 2;
            const minElevation = Math.min(edge.startNode.elevation, edge.endNode.elevation);
            const maxElevation = Math.max(edge.startNode.elevation, edge.endNode.elevation);
            parts.push(`<br/><span style="font-size: 0.9em; color: #444">Elev: ${avgElevation.toFixed(1)}m (${minElevation.toFixed(1)}-${maxElevation.toFixed(1)})</span>`);
        }

        return `<div style="font-family: system-ui; line-height: 1.4;">${parts.join('<br/>')}</div>`;
    }, []);

    // Create/update edges layer
    useEffect(() => {
        if (!mapInstance) return;

        // Remove previous layer
        if (layerRef.current) {
            layerRef.current.remove();
        }

        // Create new layer
        layerRef.current = L.layerGroup().addTo(mapInstance);

        // Add polylines for each edge
        edges.forEach((edge) => {
            const style = getEdgeStyle(edge);

            const polyline = L.polyline(
                [
                    [edge.startPosition.lat, edge.startPosition.lng],
                    [edge.endPosition.lat, edge.endPosition.lng],
                ],
                style
            );

            // Tooltip
            if (showTooltips) {
                const tooltipContent = buildTooltipContent(edge);
                polyline.bindTooltip(tooltipContent, {
                    sticky: true,
                    className: 'edge-tooltip',
                });
            }

            // Event handlers
            if (onEdgeClick) {
                polyline.on('click', (e) => {
                    L.DomEvent.stopPropagation(e);
                    onEdgeClick(edge);
                });
            }

            if (onEdgeHover) {
                polyline.on('mouseover', () => onEdgeHover(edge.id));
                polyline.on('mouseout', () => onEdgeHover(null));
            }

            polyline.addTo(layerRef.current!);
        });

        // Cleanup
        return () => {
            layerRef.current?.remove();
        };
    }, [mapInstance, edges, showTooltips, getEdgeStyle, buildTooltipContent, onEdgeClick, onEdgeHover]);

    return null;
}

/**
 * React-leaflet compatible version using hooks
 */
export function EdgesLayerReactLeaflet({
    nodes,
    draggedNodeId,
    dragPosition,
}: {
    nodes: MapNode[];
    draggedNodeId: string | null;
    dragPosition: LatLng | null;
}) {
    // This is a placeholder for a react-leaflet compatible version
    // that would use Polyline components instead of imperative Leaflet API
    return null;
}
