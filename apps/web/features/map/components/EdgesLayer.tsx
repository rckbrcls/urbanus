/**
 * Camada de Arestas do Mapa
 *
 * Renderiza as conexões (linhas) entre nós baseado no estado atual dos nós,
 * independente do GeoJSON. Isso permite que as arestas sigam os nós
 * automaticamente durante operações de drag.
 */

'use client';

import { useEffect, useRef, useMemo, useCallback } from 'react';
import type * as Leaflet from 'leaflet';
import type { MapNode, LatLng } from '../types';
import { HIGHWAY_COLORS, HIGHWAY_WEIGHTS } from '../constants';
import { useLeaflet } from '../hooks/useLeaflet';
import { getColocatedNodeIds } from '../utils/colocated';

interface Edge {
  id: string;
  streetId: string;
  streetName?: string;
  highway?: string;
  startNode: MapNode;
  endNode: MapNode;
  path: LatLng[];
}

interface EdgesLayerProps {
  mapInstance: Leaflet.Map | null;
  nodes: MapNode[];
  anchorNodeIds?: Set<string>;
  draggedNodeId: string | null;
  dragPosition: LatLng | null;
  showTooltips?: boolean;
  onEdgeClick?: (edge: Edge, clickPosition: LatLng) => void;
  onEdgeHover?: (edgeId: string | null) => void;
}

export function EdgesLayer({
  mapInstance,
  nodes,
  anchorNodeIds,
  draggedNodeId,
  dragPosition,
  showTooltips = true,
  onEdgeClick,
  onEdgeHover,
}: EdgesLayerProps) {
  const layerRef = useRef<Leaflet.LayerGroup | null>(null);
  const leaflet = useLeaflet();

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

  // Find all co-located node IDs (same position as dragged node)
  const colocatedIds = useMemo(() => {
    if (!draggedNodeId) return new Set<string>();
    const draggedNode = nodes.find((n) => n.id === draggedNodeId);
    if (!draggedNode) return new Set<string>();
    return getColocatedNodeIds(nodes, draggedNode);
  }, [nodes, draggedNodeId]);

  // Always build edges from anchor nodes.
  // If caller does not provide anchors, derive from node metadata.
  const effectiveAnchorNodeIds = useMemo(() => {
    if (anchorNodeIds && anchorNodeIds.size > 0) {
      return anchorNodeIds;
    }

    const derived = new Set<string>();
    nodes.forEach((node) => {
      if ((node.degree && node.degree >= 2) || node.isEndpoint) {
        derived.add(node.id);
      }
    });
    return derived;
  }, [nodes, anchorNodeIds]);

  // Build edges from nodes in each street
  // Connect consecutive anchor nodes directly.
  // This avoids visual "floating bends" when dragging intersections.
  const edges = useMemo(() => {
    const result: Edge[] = [];

    nodesByStreet.forEach((streetNodes, streetId) => {
      if (streetNodes.length < 2) return;

      let currentAnchor: MapNode | null = null;
      let currentAnchorPosition: LatLng | null = null;

      for (let i = 0; i < streetNodes.length; i++) {
        const node = streetNodes[i];
        const isAnchor = effectiveAnchorNodeIds.has(node.id);
        const position =
          colocatedIds.has(node.id) && dragPosition
            ? dragPosition
            : node.position;

        if (isAnchor) {
          if (currentAnchor && currentAnchorPosition) {
            // Finalize edge from previous anchor to this anchor
            result.push({
              id: `${streetId}-${currentAnchor.vertexIndex}-${node.vertexIndex}`,
              streetId,
              streetName: currentAnchor.streetName,
              highway: currentAnchor.highway,
              startNode: currentAnchor,
              endNode: node,
              path: [currentAnchorPosition, position],
            });
          }
          // Start new segment from this anchor
          currentAnchor = node;
          currentAnchorPosition = position;
        }
      }
    });

    return result;
  }, [nodesByStreet, effectiveAnchorNodeIds, colocatedIds, dragPosition]);

  // Get edge style based on highway type
  const getEdgeStyle = useCallback((edge: Edge): Leaflet.PolylineOptions => {
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
    if (!mapInstance || !leaflet) return;

    const L = leaflet;

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
        edge.path.map(p => [p.lat, p.lng] as [number, number]),
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
          const clickPosition: LatLng = {
            lat: e.latlng.lat,
            lng: e.latlng.lng,
          };
          onEdgeClick(edge, clickPosition);
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
  }, [mapInstance, leaflet, edges, showTooltips, getEdgeStyle, buildTooltipContent, onEdgeClick, onEdgeHover]);

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
