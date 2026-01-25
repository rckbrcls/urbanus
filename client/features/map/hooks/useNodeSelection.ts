/**
 * Hook de Seleção de Nós
 *
 * Gerencia o estado de seleção de nós de forma isolada
 */

import { useState, useCallback, useMemo, useEffect } from "react";
import { NodesService } from "../services";
import type {
  MapNode,
  NodeSelectionState,
  SelectionOptions,
  LatLng,
  BoundingBox,
} from "../types";

interface UseNodeSelectionOptions {
  nodes: MapNode[];
  setNodes: React.Dispatch<React.SetStateAction<MapNode[]>>;
  onSelectionChange?: (selectedIds: string[]) => void;
}

interface UseNodeSelectionReturn {
  // Estado
  selectedIds: string[];
  selectedNodes: MapNode[];
  selectedCount: number;
  hoveredId: string | null;
  lastSelectedId: string | null;
  hasSelection: boolean;

  // Ações de seleção única
  select: (nodeId: string, options?: SelectionOptions) => void;
  deselect: (nodeId: string) => void;
  toggle: (nodeId: string) => void;

  // Ações de seleção múltipla
  selectMultiple: (nodeIds: string[], options?: SelectionOptions) => void;
  selectAll: () => void;
  selectNone: () => void;
  selectInverse: () => void;
  selectStreet: (streetId: string, options?: SelectionOptions) => void;
  selectRegion: (bbox: BoundingBox, options?: SelectionOptions) => void;

  // Hover
  setHovered: (nodeId: string | null) => void;

  // Utilitários
  isSelected: (nodeId: string) => boolean;
  isHovered: (nodeId: string) => boolean;
  getSelectionBbox: () => BoundingBox | null;
}

export function useNodeSelection({
  nodes,
  setNodes,
  onSelectionChange,
}: UseNodeSelectionOptions): UseNodeSelectionReturn {
  const service = NodesService.getInstance();

  const [hoveredId, setHoveredState] = useState<string | null>(null);
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);

  // ============ COMPUTED STATE ============

  const selectedIds = useMemo(
    () => nodes.filter((n) => n.isSelected).map((n) => n.id),
    [nodes],
  );

  const selectedNodes = useMemo(
    () => nodes.filter((n) => n.isSelected),
    [nodes],
  );

  const selectedCount = selectedIds.length;
  const hasSelection = selectedCount > 0;

  // ============ SELECTION ACTIONS ============

  /**
   * Seleciona um único nó
   */
  const select = useCallback(
    (nodeId: string, options: SelectionOptions = {}) => {
      const { addToSelection = false, toggle = false } = options;

      if (toggle) {
        setNodes((prev) => service.toggleNodeSelection(prev, nodeId));
      } else {
        setNodes((prev) => service.selectNode(prev, nodeId, addToSelection));
      }

      setLastSelectedId(nodeId);
    },
    [service, setNodes],
  );

  /**
   * Deseleciona um nó
   */
  const deselect = useCallback(
    (nodeId: string) => {
      setNodes((prev) =>
        prev.map((n) => (n.id === nodeId ? { ...n, isSelected: false } : n)),
      );
    },
    [setNodes],
  );

  /**
   * Toggle seleção de um nó
   */
  const toggle = useCallback(
    (nodeId: string) => {
      setNodes((prev) => service.toggleNodeSelection(prev, nodeId));
      setLastSelectedId(nodeId);
    },
    [service, setNodes],
  );

  /**
   * Seleciona múltiplos nós
   */
  const selectMultiple = useCallback(
    (nodeIds: string[], options: SelectionOptions = {}) => {
      const { addToSelection = false } = options;
      setNodes((prev) => service.selectNodes(prev, nodeIds, addToSelection));

      if (nodeIds.length > 0) {
        setLastSelectedId(nodeIds[nodeIds.length - 1]);
      }
    },
    [service, setNodes],
  );

  /**
   * Seleciona todos os nós
   */
  const selectAll = useCallback(() => {
    setNodes((prev) => prev.map((n) => ({ ...n, isSelected: true })));
  }, [setNodes]);

  /**
   * Deseleciona todos os nós
   */
  const selectNone = useCallback(() => {
    setNodes((prev) => service.clearSelection(prev));
    setLastSelectedId(null);
  }, [service, setNodes]);

  /**
   * Inverte seleção
   */
  const selectInverse = useCallback(() => {
    setNodes((prev) => prev.map((n) => ({ ...n, isSelected: !n.isSelected })));
  }, [setNodes]);

  /**
   * Seleciona todos os nós de uma rua
   */
  const selectStreet = useCallback(
    (streetId: string, options: SelectionOptions = {}) => {
      const { addToSelection = false } = options;
      setNodes((prev) => service.selectStreet(prev, streetId, addToSelection));
    },
    [service, setNodes],
  );

  /**
   * Seleciona nós em uma região
   */
  const selectRegion = useCallback(
    (bbox: BoundingBox, options: SelectionOptions = {}) => {
      const { addToSelection = false } = options;
      setNodes((prev) => service.selectInRegion(prev, bbox, addToSelection));
    },
    [service, setNodes],
  );

  // ============ HOVER ============

  const setHovered = useCallback(
    (nodeId: string | null) => {
      setHoveredState(nodeId);
      setNodes((prev) => service.setHoveredNode(prev, nodeId));
    },
    [service, setNodes],
  );

  // ============ UTILITIES ============

  const isSelected = useCallback(
    (nodeId: string): boolean => {
      return selectedIds.includes(nodeId);
    },
    [selectedIds],
  );

  const isHovered = useCallback(
    (nodeId: string): boolean => {
      return nodeId === hoveredId;
    },
    [hoveredId],
  );

  /**
   * Calcula o bounding box da seleção atual
   */
  const getSelectionBbox = useCallback((): BoundingBox | null => {
    if (selectedNodes.length === 0) return null;

    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;

    selectedNodes.forEach((node) => {
      minLat = Math.min(minLat, node.position.lat);
      maxLat = Math.max(maxLat, node.position.lat);
      minLng = Math.min(minLng, node.position.lng);
      maxLng = Math.max(maxLng, node.position.lng);
    });

    return {
      southWest: { lat: minLat, lng: minLng },
      northEast: { lat: maxLat, lng: maxLng },
    };
  }, [selectedNodes]);

  // ============ EFFECTS ============

  // Notify when selection changes
  useEffect(() => {
    onSelectionChange?.(selectedIds);
  }, [selectedIds, onSelectionChange]);

  return {
    // Estado
    selectedIds,
    selectedNodes,
    selectedCount,
    hoveredId,
    lastSelectedId,
    hasSelection,

    // Ações de seleção única
    select,
    deselect,
    toggle,

    // Ações de seleção múltipla
    selectMultiple,
    selectAll,
    selectNone,
    selectInverse,
    selectStreet,
    selectRegion,

    // Hover
    setHovered,

    // Utilitários
    isSelected,
    isHovered,
    getSelectionBbox,
  };
}
