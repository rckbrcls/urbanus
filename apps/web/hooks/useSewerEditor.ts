/**
 * useSewerEditor — handles interactions on the processed sewer network.
 *
 * Mirrors useGraphEditor capabilities for the sewer view:
 * - Click node → select
 * - Double-click node → toggle collection point
 * - Drag node → move (updates lat/lng)
 * - Delete/Backspace → remove selected node
 * - Hover → feature-state highlight
 */

'use client';

import { useCallback, useRef, useState, useEffect } from 'react';
import type { MapRef } from 'react-map-gl/maplibre';
import type { MapMouseEvent } from 'maplibre-gl';

import { usePipelineStore } from '@/stores/pipelineStore';

const SEWER_NODE_LAYER = 'sewer-nodes-layer';

function safeQuery(map: maplibregl.Map, point: maplibregl.PointLike) {
  if (!map.getLayer(SEWER_NODE_LAYER)) return [];
  return map.queryRenderedFeatures(point, { layers: [SEWER_NODE_LAYER] });
}

interface UseSewerEditorProps {
  mapRef: React.RefObject<MapRef | null>;
  active: boolean;
}

export function useSewerEditor({ mapRef, active }: UseSewerEditorProps) {
  const hoveredIdRef = useRef<string | null>(null);

  const selectNode = usePipelineStore((s) => s.selectSewerNode);
  const toggleCP = usePipelineStore((s) => s.toggleCollectionPoint);
  const removeNode = usePipelineStore((s) => s.removeSewerNode);
  const moveNode = usePipelineStore((s) => s.moveSewerNode);
  const selectedNodeId = usePipelineStore((s) => s.selectedNodeId);

  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const dragNodeRef = useRef<string | null>(null);

  // --- Hover ---
  const handleMouseMove = useCallback(
    (e: MapMouseEvent) => {
      if (!active) return;
      const map = mapRef.current?.getMap();
      if (!map) return;

      // During drag, update node position
      if (isDragging && dragNodeRef.current) {
        moveNode(dragNodeRef.current, e.lngLat.lat, e.lngLat.lng);
        return;
      }

      const features = safeQuery(map, e.point);
      const newId = features.length > 0 ? String(features[0].id ?? '') : null;

      if (newId !== hoveredIdRef.current) {
        if (hoveredIdRef.current && map.getSource('sewer-nodes')) {
          map.setFeatureState(
            { source: 'sewer-nodes', id: hoveredIdRef.current },
            { hovered: false },
          );
        }
        if (newId && map.getSource('sewer-nodes')) {
          map.setFeatureState(
            { source: 'sewer-nodes', id: newId },
            { hovered: true },
          );
        }
        hoveredIdRef.current = newId;
        map.getCanvas().style.cursor = newId ? 'pointer' : '';
      }
    },
    [active, mapRef, isDragging, moveNode],
  );

  // --- Mouse down → start drag ---
  const handleMouseDown = useCallback(
    (e: MapMouseEvent) => {
      if (!active) return;
      const map = mapRef.current?.getMap();
      if (!map) return;

      const features = safeQuery(map, e.point);
      if (features.length === 0) return;

      const nodeId = String(features[0].id ?? '');
      e.preventDefault();
      dragNodeRef.current = nodeId;
      setIsDragging(true);
      selectNode(nodeId);
      map.dragPan.disable();
    },
    [active, mapRef, selectNode],
  );

  // --- Mouse up → end drag ---
  const handleMouseUp = useCallback(
    () => {
      if (!isDragging) return;
      const map = mapRef.current?.getMap();
      if (map) map.dragPan.enable();
      dragNodeRef.current = null;
      setIsDragging(false);
    },
    [isDragging, mapRef],
  );

  // --- Click → select ---
  const handleClick = useCallback(
    (e: MapMouseEvent) => {
      if (!active || isDragging) return;
      const map = mapRef.current?.getMap();
      if (!map) return;

      const features = safeQuery(map, e.point);
      if (features.length > 0) {
        selectNode(String(features[0].id ?? ''));
      } else {
        selectNode(null);
      }
    },
    [active, isDragging, mapRef, selectNode],
  );

  // --- Double-click → toggle collection point ---
  const handleDblClick = useCallback(
    (e: MapMouseEvent) => {
      if (!active) return;
      const map = mapRef.current?.getMap();
      if (!map) return;

      const features = safeQuery(map, e.point);
      if (features.length > 0) {
        e.preventDefault();
        toggleCP(String(features[0].id ?? ''));
      }
    },
    [active, mapRef, toggleCP],
  );

  // --- Keyboard ---
  useEffect(() => {
    if (!active) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId) {
        removeNode(selectedNodeId);
      }
      if (e.key === 'Escape') {
        selectNode(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [active, selectedNodeId, removeNode, selectNode]);

  return {
    isDragging,
    handleClick,
    handleMouseMove,
    handleMouseDown,
    handleMouseUp,
    handleDblClick,
  };
}
