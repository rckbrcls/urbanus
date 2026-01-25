/**
 * Hook de Drag de Nós
 *
 * Gerencia operação de arrastar nós no mapa
 * Otimizado para performance: throttling, sem validação durante drag, sem atualizar todos os nós
 */

import { useState, useCallback, useRef, useMemo } from "react";
import { NodesService } from "../services";
import { useThrottle } from "../utils/throttle";
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
  throttleMs?: number;
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
    validateOnMove = false, // Desabilitado por padrão para melhor performance
    throttleMs = 16, // ~60fps
  } = options;

  const service = NodesService.getInstance();

  const [isDragging, setIsDragging] = useState(false);
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dragPosition, setDragPosition] = useState<LatLng | null>(null);
  const [validation, setValidation] = useState<MoveValidationResult | null>(
    null,
  );

  const originalPositionRef = useRef<LatLng | null>(null);
  const draggedNodeRef = useRef<MapNode | null>(null);
  const isDraggingRef = useRef(false);
  const draggedNodeIdRef = useRef<string | null>(null);

  /**
   * Inicia drag de um nó
   * Otimizado: não atualiza todos os nós, apenas marca estado interno
   */
  const startDrag = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;

      originalPositionRef.current = { ...node.position };
      draggedNodeRef.current = node;
      isDraggingRef.current = true;
      draggedNodeIdRef.current = nodeId;
      setIsDragging(true);
      setDraggedNodeId(nodeId);
      setDragPosition(node.position);

      // NÃO atualiza todos os nós aqui - apenas usa dragPosition durante render
      onDragStart?.(node);
    },
    [nodes, onDragStart],
  );

  // RAF para atualização suave
  const rafIdRef = useRef<number | null>(null);
  const pendingPositionRef = useRef<LatLng | null>(null);

  /**
   * Atualiza posição durante drag
   * Otimizado: usa RAF para animação suave, sempre processa posição mais recente
   * Sem validação durante drag, apenas atualiza posição visual
   */
  const updateDrag = useCallback(
    (position: LatLng) => {
      // Usa refs para verificar estado atualizado
      if (!isDraggingRef.current || !draggedNodeIdRef.current) return;

      // Sempre salva a posição mais recente
      pendingPositionRef.current = position;

      // Se já tem um RAF agendado, não agenda outro
      // Mas sempre atualiza pendingPositionRef com a posição mais recente
      if (rafIdRef.current !== null) return;

      // Função recursiva para processar todas as atualizações pendentes
      const processUpdate = () => {
        const latest = pendingPositionRef.current;
        if (latest && isDraggingRef.current) {
          // Atualiza posição visual
          setDragPosition(latest);

          const node = draggedNodeRef.current;
          if (node) {
            onDragMove?.(node, latest);
          }

          // Limpa posição processada
          pendingPositionRef.current = null;
          rafIdRef.current = null;

          // Se ainda tem posição pendente (mouse se moveu durante o frame), agenda outro
          if (pendingPositionRef.current && isDraggingRef.current) {
            rafIdRef.current = requestAnimationFrame(processUpdate);
          }
        } else {
          rafIdRef.current = null;
        }
      };

      // Agenda primeira atualização
      rafIdRef.current = requestAnimationFrame(processUpdate);
    },
    [onDragMove],
  );

  /**
   * Reset do estado interno
   * Otimizado: não atualiza todos os nós desnecessariamente
   */
  const resetDragState = useCallback(() => {
    isDraggingRef.current = false;
    draggedNodeIdRef.current = null;
    setIsDragging(false);
    setDraggedNodeId(null);
    setDragPosition(null);
    setValidation(null);
    originalPositionRef.current = null;
    draggedNodeRef.current = null;
    
    // Limpa qualquer RAF pendente
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    pendingPositionRef.current = null;
    lastUpdateRef.current = 0;
    
  }, []);

  /**
   * Cancela drag e retorna à posição original
   * Otimizado: não atualiza todos os nós, apenas reseta estado interno
   */
  const cancelDrag = useCallback(() => {
    if (!isDragging || !draggedNodeId) return;

    const node = draggedNodeRef.current;

    // Reset estado (não precisa atualizar todos os nós)
    resetDragState();

    if (node) {
      onDragCancel?.(node);
    }
  }, [isDragging, draggedNodeId, resetDragState, onDragCancel]);

  /**
   * Finaliza drag e aplica movimento
   * Otimizado: validação só no final, atualiza estado apenas uma vez
   */
  const endDrag = useCallback(() => {
    if (!isDragging || !draggedNodeId || !dragPosition) return;

    const node = draggedNodeRef.current || nodes.find((n) => n.id === draggedNodeId);
    if (!node) return;

    // Valida movimento final se bbox disponível (só no final, não durante drag)
    if (bbox) {
      const validationResult = service.validateMove(
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

    // Aplica movimento (atualiza estado apenas uma vez no final)
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
    resetDragState,
    cancelDrag,
    onDragEnd,
  ]);

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
