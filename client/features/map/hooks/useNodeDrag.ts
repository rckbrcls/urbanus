/**
 * Hook de Drag de Nós
 *
 * Gerencia operação de arrastar nós no mapa
 */

import { useState, useCallback, useRef } from "react";
import { NodesService } from "../services";
import type {
  BoundingBox,
  LatLng,
  MapNode,
  MoveValidationResult,
} from "../types";

interface UseNodeDragOptions {
  nodes: MapNode[];
  setNodes: React.Dispatch<React.SetStateAction<MapNode[]>>;
  bbox: BoundingBox | null;
  onDragStart?: (node: MapNode) => void;
  onDragMove?: (node: MapNode, position: LatLng) => void;
  onDragEnd?: (node: MapNode, finalPosition: LatLng) => void;
  onDragCancel?: (node: MapNode) => void;
  validateOnMove?: boolean;
}

export function useNodeDrag(options: UseNodeDragOptions) {
  const {
    nodes,
    setNodes,
    bbox,
    onDragStart,
    onDragMove,
    onDragEnd,
    onDragCancel,
    validateOnMove = true,
  } = options;

  const service = NodesService.getInstance();

  const [isDragging, setIsDragging] = useState(false);
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dragPosition, setDragPosition] = useState<LatLng | null>(null);
  const [validation, setValidation] = useState<MoveValidationResult | null>(
    null,
  );

  const originalPositionRef = useRef<LatLng | null>(null);

  /**
   * Inicia drag de um nó
   */
  const startDrag = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;

      originalPositionRef.current = { ...node.position };
      setIsDragging(true);
      setDraggedNodeId(nodeId);
      setDragPosition(node.position);

      // Atualiza estado do nó
      setNodes((prevNodes) =>
        prevNodes.map((n) => ({
          ...n,
          isDragging: n.id === nodeId,
        })),
      );

      onDragStart?.(node);
    },
    [nodes, setNodes, onDragStart],
  );

  /**
   * Atualiza posição durante drag
   */
  const updateDrag = useCallback(
    async (position: LatLng) => {
      if (!isDragging || !draggedNodeId) return;

      setDragPosition(position);

      // Validação em tempo real (opcional)
      if (validateOnMove && bbox) {
        const node = nodes.find((n) => n.id === draggedNodeId);
        if (node) {
          const result = await service.validateMove(
            node,
            position,
            nodes,
            bbox,
          );
          setValidation(result);
        }
      }

      const node = nodes.find((n) => n.id === draggedNodeId);
      if (node) {
        onDragMove?.(node, position);
      }
    },
    [
      isDragging,
      draggedNodeId,
      nodes,
      bbox,
      service,
      validateOnMove,
      onDragMove,
    ],
  );

  /**
   * Finaliza drag e aplica movimento
   */
  const endDrag = useCallback(async () => {
    if (!isDragging || !draggedNodeId || !dragPosition) return;

    const node = nodes.find((n) => n.id === draggedNodeId);
    if (!node) return;

    // Valida movimento final se bbox disponível
    if (bbox) {
      const validationResult = await service.validateMove(
        node,
        dragPosition,
        nodes,
        bbox,
      );

      if (!validationResult.valid) {
        // Cancela e retorna à posição original
        cancelDrag();
        return;
      }
    }

    // Aplica movimento
    const { nodes: updatedNodes } = service.moveNode(
      nodes,
      draggedNodeId,
      dragPosition,
    );
    setNodes(updatedNodes);

    // Reset estado
    resetDragState();

    onDragEnd?.(node, dragPosition);
  }, [
    isDragging,
    draggedNodeId,
    dragPosition,
    nodes,
    bbox,
    service,
    setNodes,
    onDragEnd,
  ]);

  /**
   * Cancela drag e retorna à posição original
   */
  const cancelDrag = useCallback(() => {
    if (!isDragging || !draggedNodeId) return;

    const node = nodes.find((n) => n.id === draggedNodeId);

    // Reset estado dos nós
    setNodes((prevNodes) =>
      prevNodes.map((n) => ({
        ...n,
        isDragging: false,
      })),
    );

    resetDragState();

    if (node) {
      onDragCancel?.(node);
    }
  }, [isDragging, draggedNodeId, nodes, setNodes, onDragCancel]);

  /**
   * Reset do estado interno
   */
  const resetDragState = useCallback(() => {
    setIsDragging(false);
    setDraggedNodeId(null);
    setDragPosition(null);
    setValidation(null);
    originalPositionRef.current = null;

    setNodes((prevNodes) =>
      prevNodes.map((n) => ({
        ...n,
        isDragging: false,
      })),
    );
  }, [setNodes]);

  return {
    isDragging,
    draggedNodeId,
    dragPosition,
    validation,
    originalPosition: originalPositionRef.current,
    startDrag,
    updateDrag,
    endDrag,
    cancelDrag,
  };
}
