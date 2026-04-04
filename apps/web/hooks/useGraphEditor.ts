/**
 * useGraphEditor — orchestrates all map interactions for the graph editor.
 *
 * Reads editingMode from graphStore and dispatches commands accordingly.
 * Manages feature-state for hover/selection via direct MapLibre API calls.
 */

'use client';

import { useCallback, useRef, useState, useEffect } from 'react';
import type { MapRef } from 'react-map-gl/maplibre';
import type maplibregl from 'maplibre-gl';
import type { MapMouseEvent } from 'maplibre-gl';
import { v4 as uuidv4 } from 'uuid';

import { useGraphStore } from '@/stores/graphStore';
import { useCommandManager, getStoreAccessor } from '@/stores/commandManager';
import type { NetworkNode, NetworkEdge } from '@/lib/graph/types';
import {
  AddNodeCommand,
  RemoveNodeCommand,
  MoveNodeCommand,
  AddEdgeCommand,
  RemoveEdgeCommand,
  SplitEdgeCommand,
} from '@/lib/graph/commands';
import { calculateEdgeLength, calculateSlope } from '@/lib/graph/operations';
import { snapToNearest } from '@/lib/map/snapping';

const INTERACTIVE_LAYERS = ['graph-nodes-layer', 'graph-edges-layer'];

/** Only query layers that actually exist in the current style. */
function safeQuery(map: maplibregl.Map, point: maplibregl.PointLike, layers: string[]) {
  const existing = layers.filter((l) => map.getLayer(l));
  if (existing.length === 0) return [];
  return map.queryRenderedFeatures(point, { layers: existing });
}

/** Check whether a source has been added to the map style. */
function sourceExists(map: maplibregl.Map, source: string): boolean {
  return !!map.getSource(source);
}

interface UseGraphEditorOptions {
  mapRef: React.RefObject<MapRef | null>;
  streetFeatures?: GeoJSON.FeatureCollection | null;
}

export function useGraphEditor({ mapRef, streetFeatures }: UseGraphEditorOptions) {
  const editingMode = useGraphStore((s) => s.editingMode);
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const selectedNodeIds = useGraphStore((s) => s.selectedNodeIds);
  const setSelection = useGraphStore((s) => s.setSelection);
  const setHover = useGraphStore((s) => s.setHover);
  const moveNode = useGraphStore((s) => s.moveNode);

  const execute = useCommandManager((s) => s.execute);

  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const dragNodeRef = useRef<string | null>(null);
  const dragStartCoords = useRef<[number, number, number] | null>(null);

  // Ghost edge state (add-edge mode)
  const [ghostEdgeFrom, setGhostEdgeFrom] = useState<[number, number] | null>(null);
  const [ghostEdgeTo, setGhostEdgeTo] = useState<[number, number] | null>(null);
  const addEdgeSourceRef = useRef<string | null>(null);

  // Previous hover tracking
  const prevHoveredRef = useRef<{ source: string; id: string } | null>(null);

  const accessor = getStoreAccessor();

  // ============ FEATURE STATE HELPERS ============

  const clearHoverState = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map || !prevHoveredRef.current) return;

    if (sourceExists(map, prevHoveredRef.current.source)) {
      map.setFeatureState(
        { source: prevHoveredRef.current.source, id: prevHoveredRef.current.id },
        { hovered: false },
      );
    }
    prevHoveredRef.current = null;
  }, [mapRef]);

  const setFeatureHover = useCallback(
    (source: string, id: string) => {
      const map = mapRef.current?.getMap();
      if (!map) return;

      clearHoverState();
      if (sourceExists(map, source)) {
        map.setFeatureState({ source, id }, { hovered: true });
        prevHoveredRef.current = { source, id };
      }
    },
    [mapRef, clearHoverState],
  );

  const syncSelectionState = useCallback(
    (nodeIds: string[], edgeIds: string[] = []) => {
      const map = mapRef.current?.getMap();
      if (!map) return;
      if (!sourceExists(map, 'graph-nodes') || !sourceExists(map, 'graph-edges')) return;

      // Clear old selection state
      for (const nid of Object.keys(nodes)) {
        map.setFeatureState({ source: 'graph-nodes', id: nid }, { selected: false });
      }
      for (const eid of Object.keys(edges)) {
        map.setFeatureState({ source: 'graph-edges', id: eid }, { selected: false });
      }

      // Set new selection
      for (const nid of nodeIds) {
        map.setFeatureState({ source: 'graph-nodes', id: nid }, { selected: true });
      }
      for (const eid of edgeIds) {
        map.setFeatureState({ source: 'graph-edges', id: eid }, { selected: true });
      }
    },
    [mapRef, nodes, edges],
  );

  // ============ EVENT HANDLERS ============

  const handleMouseMove = useCallback(
    (e: MapMouseEvent) => {
      const map = mapRef.current?.getMap();
      if (!map) return;

      // Ghost edge tracking
      if (editingMode === 'add-edge' && addEdgeSourceRef.current) {
        setGhostEdgeTo([e.lngLat.lng, e.lngLat.lat]);
      }

      // Node drag
      if (isDragging && dragNodeRef.current) {
        moveNode(dragNodeRef.current, [e.lngLat.lng, e.lngLat.lat, NaN]);
        return;
      }

      // Hover
      const features = safeQuery(map, e.point, INTERACTIVE_LAYERS);

      if (features.length > 0) {
        map.getCanvas().style.cursor = editingMode === 'delete' ? 'crosshair' : 'pointer';
        const feat = features[0];
        const id = String(feat.properties?.id ?? feat.id ?? '');
        const source = feat.layer?.id?.includes('nodes') ? 'graph-nodes' : 'graph-edges';
        setFeatureHover(source, id);
        setHover(id);
      } else {
        map.getCanvas().style.cursor = editingMode === 'add-node' ? 'crosshair' : '';
        clearHoverState();
        setHover(null);
      }
    },
    [mapRef, editingMode, isDragging, moveNode, setFeatureHover, clearHoverState, setHover],
  );

  const handleMouseDown = useCallback(
    (e: MapMouseEvent) => {
      if (editingMode !== 'move' && editingMode !== 'select') return;

      const map = mapRef.current?.getMap();
      if (!map) return;

      const features = safeQuery(map, e.point, ['graph-nodes-layer']);
      if (features.length === 0) return;

      const feat = features[0];
      const nodeId = String(feat.properties?.id ?? feat.id ?? '');
      const node = nodes[nodeId];
      if (!node) return;

      if (editingMode === 'move') {
        e.preventDefault();
        dragNodeRef.current = nodeId;
        dragStartCoords.current = [...node.coordinates] as [number, number, number];
        setIsDragging(true);
        map.dragPan.disable();
      }
    },
    [editingMode, mapRef, nodes],
  );

  const handleMouseUp = useCallback(
    (e: MapMouseEvent) => {
      if (!isDragging || !dragNodeRef.current || !dragStartCoords.current) return;

      const map = mapRef.current?.getMap();
      if (!map) return;

      const nodeId = dragNodeRef.current;
      const oldCoords = dragStartCoords.current;
      const newCoords: [number, number, number] = [e.lngLat.lng, e.lngLat.lat, oldCoords[2]];

      // Commit via command
      execute(new MoveNodeCommand(accessor, nodeId, oldCoords, newCoords));

      dragNodeRef.current = null;
      dragStartCoords.current = null;
      setIsDragging(false);
      map.dragPan.enable();
    },
    [isDragging, mapRef, execute, accessor],
  );

  const handleClick = useCallback(
    (e: MapMouseEvent) => {
      const map = mapRef.current?.getMap();
      if (!map) return;

      const features = safeQuery(map, e.point, INTERACTIVE_LAYERS);

      switch (editingMode) {
        case 'select': {
          if (features.length > 0) {
            const feat = features[0];
            const id = String(feat.properties?.id ?? feat.id ?? '');
            const isNode = feat.layer?.id?.includes('nodes');

            if (e.originalEvent.shiftKey) {
              // Multi-select
              if (isNode) {
                const current = selectedNodeIds.includes(id)
                  ? selectedNodeIds.filter((nid) => nid !== id)
                  : [...selectedNodeIds, id];
                setSelection(current);
                syncSelectionState(current);
              }
            } else {
              if (isNode) {
                setSelection([id]);
                syncSelectionState([id]);
              } else {
                setSelection([], [id]);
                syncSelectionState([], [id]);
              }
            }
          } else {
            setSelection([]);
            syncSelectionState([]);
          }
          break;
        }

        case 'add-node': {
          const snap = snapToNearest(e.lngLat, mapRef.current, streetFeatures ?? null);
          const id = uuidv4();
          const newNode: NetworkNode = {
            id,
            coordinates: [snap.coordinates[0], snap.coordinates[1], NaN],
            properties: {
              elevation: null,
              degree: 0,
              edgeIds: [],
            },
          };
          execute(new AddNodeCommand(accessor, newNode));
          break;
        }

        case 'add-edge': {
          if (features.length === 0) break;
          const feat = features[0];
          if (!feat.layer?.id?.includes('nodes')) break;

          const nodeId = String(feat.properties?.id ?? feat.id ?? '');

          if (!addEdgeSourceRef.current) {
            // First click — set source
            addEdgeSourceRef.current = nodeId;
            const node = nodes[nodeId];
            if (node) {
              setGhostEdgeFrom([node.coordinates[0], node.coordinates[1]]);
            }
          } else if (nodeId !== addEdgeSourceRef.current) {
            // Second click — create edge
            const sourceNode = nodes[addEdgeSourceRef.current];
            const targetNode = nodes[nodeId];
            if (sourceNode && targetNode) {
              const length = calculateEdgeLength(sourceNode, targetNode);
              const slope = calculateSlope(sourceNode, targetNode, length);
              const edge: NetworkEdge = {
                id: uuidv4(),
                sourceId: addEdgeSourceRef.current,
                targetId: nodeId,
                geometry: [],
                properties: { length, slope },
              };
              execute(new AddEdgeCommand(accessor, edge));
            }
            // Reset
            addEdgeSourceRef.current = null;
            setGhostEdgeFrom(null);
            setGhostEdgeTo(null);
          }
          break;
        }

        case 'delete': {
          if (features.length === 0) break;
          const feat = features[0];
          const id = String(feat.properties?.id ?? feat.id ?? '');
          const isNode = feat.layer?.id?.includes('nodes');

          if (isNode) {
            execute(new RemoveNodeCommand(accessor, id));
          } else {
            execute(new RemoveEdgeCommand(accessor, id));
          }
          break;
        }

        case 'split-edge': {
          if (features.length === 0) break;
          const feat = features[0];
          if (feat.layer?.id?.includes('nodes')) break; // Only edges

          const edgeId = String(feat.properties?.id ?? feat.id ?? '');
          const edge = edges[edgeId];
          if (!edge) break;

          const source = nodes[edge.sourceId];
          const target = nodes[edge.targetId];
          if (!source || !target) break;

          const newNodeId = uuidv4();
          const newNode: NetworkNode = {
            id: newNodeId,
            coordinates: [e.lngLat.lng, e.lngLat.lat, NaN],
            properties: {
              elevation: null,
              degree: 2,
              edgeIds: [],
            },
          };

          const edge1: NetworkEdge = {
            id: uuidv4(),
            sourceId: edge.sourceId,
            targetId: newNodeId,
            geometry: [],
            properties: {
              length: calculateEdgeLength(source, newNode),
              slope: calculateSlope(source, newNode, calculateEdgeLength(source, newNode)),
              streetId: edge.properties.streetId,
              streetName: edge.properties.streetName,
              highway: edge.properties.highway,
            },
          };

          const edge2: NetworkEdge = {
            id: uuidv4(),
            sourceId: newNodeId,
            targetId: edge.targetId,
            geometry: [],
            properties: {
              length: calculateEdgeLength(newNode, target),
              slope: calculateSlope(newNode, target, calculateEdgeLength(newNode, target)),
              streetId: edge.properties.streetId,
              streetName: edge.properties.streetName,
              highway: edge.properties.highway,
            },
          };

          execute(new SplitEdgeCommand(accessor, edgeId, newNode, edge1, edge2));
          break;
        }
      }
    },
    [editingMode, mapRef, nodes, edges, selectedNodeIds, setSelection, syncSelectionState, execute, accessor, streetFeatures],
  );

  // ============ KEYBOARD ============

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Cancel add-edge
        addEdgeSourceRef.current = null;
        setGhostEdgeFrom(null);
        setGhostEdgeTo(null);
        setSelection([]);
        syncSelectionState([]);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          useCommandManager.getState().redo();
        } else {
          useCommandManager.getState().undo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setSelection, syncSelectionState]);

  return {
    isDragging,
    ghostEdgeFrom,
    ghostEdgeTo,
    handleClick,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
  };
}
