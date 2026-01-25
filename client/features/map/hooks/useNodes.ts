/**
 * Hook de Gerenciamento de Nós
 *
 * Hook principal que integra seleção, edição e histórico de nós
 */

import { useState, useCallback, useMemo, useEffect } from "react";
import { NodesService, NodeOperationError } from "../services";
import { useNodeSelection } from "./useNodeSelection";
import { useNodeHistory } from "./useNodeHistory";
import type {
  BoundingBox,
  LatLng,
  MapNode,
  NodeEditMode,
  NodeAction,
} from "../types";

interface UseNodesOptions {
  /** Callback quando nó é selecionado */
  onNodeSelect?: (node: MapNode | null) => void;
  /** Callback quando nó é movido */
  onNodeMove?: (node: MapNode, newPosition: LatLng) => void;
  /** Callback quando nó é deletado */
  onNodeDelete?: (node: MapNode) => void;
  /** Callback quando ocorre erro */
  onError?: (error: NodeOperationError) => void;
  /** Callback quando seleção muda */
  onSelectionChange?: (selectedIds: string[]) => void;
  /** Habilitar atalhos de teclado */
  enableKeyboardShortcuts?: boolean;
}

interface UseNodesReturn {
  // Estado principal
  nodes: MapNode[];
  setNodes: React.Dispatch<React.SetStateAction<MapNode[]>>;
  editMode: NodeEditMode;
  setEditMode: React.Dispatch<React.SetStateAction<NodeEditMode>>;

  // Estado computado
  selectedNodes: MapNode[];
  selectedNode: MapNode | null;
  selectedCount: number;
  hasSelection: boolean;
  hoveredId: string | null;

  // Estatísticas
  stats: {
    total: number;
    endpoints: number;
    intermediate: number;
    selected: number;
    canUndo: boolean;
    canRedo: boolean;
    undoSize: number;
    redoSize: number;
  };

  // Extração
  extractFromStreets: (streets: GeoJSON.FeatureCollection) => MapNode[];

  // Seleção
  select: (nodeId: string, addToSelection?: boolean) => void;
  deselect: (nodeId: string) => void;
  toggle: (nodeId: string) => void;
  selectMultiple: (nodeIds: string[], addToSelection?: boolean) => void;
  selectAll: () => void;
  selectNone: () => void;
  selectStreet: (streetId: string, addToSelection?: boolean) => void;
  selectRegion: (bbox: BoundingBox, addToSelection?: boolean) => void;
  setHovered: (nodeId: string | null) => void;

  // Operações de edição
  moveNode: (
    nodeId: string,
    newPosition: LatLng,
    bbox?: BoundingBox,
  ) => Promise<void>;
  deleteNode: (nodeId: string) => void;
  deleteSelected: () => void;
  createNode: (streetId: string, position: LatLng, afterIndex: number) => void;

  // Operações em batch
  moveSelected: (delta: { lat: number; lng: number }) => void;

  // Histórico
  undo: () => NodeAction | null;
  redo: () => NodeAction | null;
  clearHistory: () => void;

  // GeoJSON
  applyToStreets: (
    streets: GeoJSON.FeatureCollection,
  ) => GeoJSON.FeatureCollection;

  // Lock
  lockSelected: () => void;
  unlockSelected: () => void;

  // Utilitários
  getNodeById: (nodeId: string) => MapNode | undefined;
  isSelected: (nodeId: string) => boolean;
  reset: () => void;
}

export function useNodes(options: UseNodesOptions = {}): UseNodesReturn {
  const {
    onNodeSelect,
    onNodeMove,
    onNodeDelete,
    onError,
    onSelectionChange,
    enableKeyboardShortcuts = true,
  } = options;

  const service = NodesService.getInstance();

  // ============ STATE ============

  const [nodes, setNodes] = useState<MapNode[]>([]);
  const [editMode, setEditMode] = useState<NodeEditMode>("none");

  // ============ COMPOSED HOOKS ============

  const selection = useNodeSelection({
    nodes,
    setNodes,
    onSelectionChange,
  });

  const history = useNodeHistory({
    nodes,
    setNodes,
    enableKeyboardShortcuts,
  });

  // ============ COMPUTED STATE ============

  const selectedNode = useMemo(
    () => selection.selectedNodes[0] || null,
    [selection.selectedNodes],
  );

  const stats = useMemo(() => {
    const nodeStats = service.getStats(nodes);
    return {
      total: nodeStats.total,
      endpoints: nodeStats.endpoints,
      intermediate: nodeStats.intermediate,
      selected: nodeStats.selected,
      canUndo: history.canUndo,
      canRedo: history.canRedo,
      undoSize: history.undoSize,
      redoSize: history.redoSize,
    };
  }, [nodes, service, history]);

  // ============ EXTRACTION ============

  const extractFromStreets = useCallback(
    (streets: GeoJSON.FeatureCollection): MapNode[] => {
      const extractedNodes = service.extractNodesFromStreets(streets);
      setNodes(extractedNodes);
      history.clearHistory();
      return extractedNodes;
    },
    [service, history],
  );

  // ============ SINGLE NODE OPERATIONS ============

  /**
   * Move um nó para nova posição
   */
  const moveNode = useCallback(
    async (
      nodeId: string,
      newPosition: LatLng,
      bbox?: BoundingBox,
    ): Promise<void> => {
      try {
        const node = nodes.find((n) => n.id === nodeId);
        if (!node) {
          throw new NodeOperationError(
            `Nó não encontrado: ${nodeId}`,
            "NODE_NOT_FOUND",
          );
        }

        // Validar se bbox fornecido
        if (bbox) {
          const validation = service.validateMove(
            node,
            newPosition,
            nodes,
            bbox,
          );
          if (!validation.valid) {
            throw new NodeOperationError(
              validation.errors[0]?.message || "Movimento inválido",
              validation.errors[0]?.code || "INVALID_POSITION",
            );
          }
        }

        const result = service.moveNode(nodes, nodeId, newPosition);
        setNodes(result.nodes);

        const movedNode = result.nodes.find((n) => n.id === nodeId);
        if (movedNode) {
          onNodeMove?.(movedNode, newPosition);
        }
      } catch (error) {
        if (error instanceof NodeOperationError) {
          onError?.(error);
        }
        throw error;
      }
    },
    [nodes, service, onNodeMove, onError],
  );

  /**
   * Deleta um nó
   */
  const deleteNode = useCallback(
    (nodeId: string): void => {
      try {
        const nodeToDelete = nodes.find((n) => n.id === nodeId);
        const result = service.deleteNode(nodes, nodeId);
        setNodes(result.nodes);

        if (nodeToDelete) {
          onNodeDelete?.(nodeToDelete);
        }
      } catch (error) {
        if (error instanceof NodeOperationError) {
          onError?.(error);
        }
        throw error;
      }
    },
    [nodes, service, onNodeDelete, onError],
  );

  /**
   * Deleta todos os nós selecionados
   */
  const deleteSelected = useCallback(() => {
    const result = service.deleteNodes(nodes, selection.selectedIds);
    setNodes(result.nodes);

    if (result.failedIds.length > 0) {
      onError?.(
        new NodeOperationError(
          `${result.failedIds.length} nó(s) não puderam ser deletados`,
          "PARTIAL_DELETE",
        ),
      );
    }
  }, [nodes, service, selection.selectedIds, onError]);

  /**
   * Cria um novo nó
   */
  const createNode = useCallback(
    (streetId: string, position: LatLng, afterIndex: number): void => {
      const result = service.createNode(nodes, streetId, position, afterIndex);
      setNodes(result.nodes);
    },
    [nodes, service],
  );

  // ============ BATCH OPERATIONS ============

  /**
   * Move todos os nós selecionados por um delta
   */
  const moveSelected = useCallback(
    (delta: { lat: number; lng: number }): void => {
      const movements = selection.selectedNodes.map((node) => ({
        nodeId: node.id,
        newPosition: {
          lat: node.position.lat + delta.lat,
          lng: node.position.lng + delta.lng,
        },
      }));

      const result = service.moveNodes(nodes, movements);
      setNodes(result.nodes);

      if (result.failedIds.length > 0) {
        onError?.(
          new NodeOperationError(
            `${result.failedIds.length} nó(s) não puderam ser movidos`,
            "PARTIAL_MOVE",
          ),
        );
      }
    },
    [nodes, service, selection.selectedNodes, onError],
  );

  // ============ LOCK OPERATIONS ============

  const lockSelected = useCallback(() => {
    setNodes((prev) =>
      service.setNodesLocked(prev, selection.selectedIds, true),
    );
  }, [service, selection.selectedIds]);

  const unlockSelected = useCallback(() => {
    setNodes((prev) =>
      service.setNodesLocked(prev, selection.selectedIds, false),
    );
  }, [service, selection.selectedIds]);

  // ============ GEOJSON ============

  const applyToStreets = useCallback(
    (streets: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection => {
      return service.applyNodesToStreets(streets, nodes);
    },
    [nodes, service],
  );

  // ============ UTILITIES ============

  const getNodeById = useCallback(
    (nodeId: string): MapNode | undefined => {
      return nodes.find((n) => n.id === nodeId);
    },
    [nodes],
  );

  const reset = useCallback(() => {
    setNodes([]);
    setEditMode("none");
    history.clearHistory();
  }, [history]);

  // ============ EFFECTS ============

  // Notify when selected node changes
  useEffect(() => {
    onNodeSelect?.(selectedNode);
  }, [selectedNode, onNodeSelect]);

  // ============ KEYBOARD SHORTCUTS FOR DELETE ============

  useEffect(() => {
    if (!enableKeyboardShortcuts) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // Delete/Backspace = Delete selected
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selection.hasSelection
      ) {
        e.preventDefault();
        deleteSelected();
      }

      // Escape = Clear selection
      if (e.key === "Escape") {
        e.preventDefault();
        selection.selectNone();
        setEditMode("none");
      }

      // A = Select all (with Ctrl/Cmd)
      if ((e.ctrlKey || e.metaKey) && e.key === "a") {
        e.preventDefault();
        selection.selectAll();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enableKeyboardShortcuts, selection, deleteSelected]);

  return {
    // Estado principal
    nodes,
    setNodes,
    editMode,
    setEditMode,

    // Estado computado
    selectedNodes: selection.selectedNodes,
    selectedNode,
    selectedCount: selection.selectedCount,
    hasSelection: selection.hasSelection,
    hoveredId: selection.hoveredId,

    // Estatísticas
    stats,

    // Extração
    extractFromStreets,

    // Seleção (delegada ao hook de seleção)
    select: (nodeId, addToSelection) =>
      selection.select(nodeId, { addToSelection }),
    deselect: selection.deselect,
    toggle: selection.toggle,
    selectMultiple: (nodeIds, addToSelection) =>
      selection.selectMultiple(nodeIds, { addToSelection }),
    selectAll: selection.selectAll,
    selectNone: selection.selectNone,
    selectStreet: (streetId, addToSelection) =>
      selection.selectStreet(streetId, { addToSelection }),
    selectRegion: (bbox, addToSelection) =>
      selection.selectRegion(bbox, { addToSelection }),
    setHovered: selection.setHovered,

    // Operações de edição
    moveNode,
    deleteNode,
    deleteSelected,
    createNode,

    // Operações em batch
    moveSelected,

    // Histórico (delegado ao hook de histórico)
    undo: history.undo,
    redo: history.redo,
    clearHistory: history.clearHistory,

    // GeoJSON
    applyToStreets,

    // Lock
    lockSelected,
    unlockSelected,

    // Utilitários
    getNodeById,
    isSelected: selection.isSelected,
    reset,
  };
}
