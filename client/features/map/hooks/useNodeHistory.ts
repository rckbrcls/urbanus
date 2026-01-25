/**
 * Hook de Histórico de Nós (Undo/Redo)
 *
 * Gerencia o histórico de operações com nós
 */

import { useCallback, useEffect } from "react";
import { NodesService } from "../services";
import type { MapNode, NodeAction } from "../types";
import { KEYBOARD_SHORTCUTS } from "../constants";

interface UseNodeHistoryOptions {
  nodes: MapNode[];
  setNodes: React.Dispatch<React.SetStateAction<MapNode[]>>;
  onUndo?: (action: NodeAction) => void;
  onRedo?: (action: NodeAction) => void;
  enableKeyboardShortcuts?: boolean;
}

interface UseNodeHistoryReturn {
  // Estado
  canUndo: boolean;
  canRedo: boolean;
  undoSize: number;
  redoSize: number;

  // Ações
  undo: () => NodeAction | null;
  redo: () => NodeAction | null;
  clearHistory: () => void;
}

export function useNodeHistory({
  nodes,
  setNodes,
  onUndo,
  onRedo,
  enableKeyboardShortcuts = true,
}: UseNodeHistoryOptions): UseNodeHistoryReturn {
  const service = NodesService.getInstance();

  // ============ STATE ============

  const canUndo = service.canUndo();
  const canRedo = service.canRedo();
  const undoSize = service.getUndoSize();
  const redoSize = service.getRedoSize();

  // ============ ACTIONS ============

  /**
   * Desfaz última ação
   */
  const undo = useCallback((): NodeAction | null => {
    const result = service.undo(nodes);
    if (result.action) {
      setNodes(result.nodes);
      onUndo?.(result.action);
    }
    return result.action;
  }, [service, nodes, setNodes, onUndo]);

  /**
   * Refaz última ação desfeita
   */
  const redo = useCallback((): NodeAction | null => {
    const result = service.redo(nodes);
    if (result.action) {
      setNodes(result.nodes);
      onRedo?.(result.action);
    }
    return result.action;
  }, [service, nodes, setNodes, onRedo]);

  /**
   * Limpa histórico
   */
  const clearHistory = useCallback(() => {
    service.clearHistory();
  }, [service]);

  // ============ KEYBOARD SHORTCUTS ============

  useEffect(() => {
    if (!enableKeyboardShortcuts) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignorar se foco está em input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // Ctrl/Cmd + Z = Undo
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key === KEYBOARD_SHORTCUTS.UNDO &&
        !e.shiftKey
      ) {
        e.preventDefault();
        undo();
      }

      // Ctrl/Cmd + Shift + Z = Redo (or Ctrl/Cmd + Y)
      if (
        (e.ctrlKey || e.metaKey) &&
        ((e.key === KEYBOARD_SHORTCUTS.UNDO && e.shiftKey) || e.key === "y")
      ) {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enableKeyboardShortcuts, undo, redo]);

  return {
    // Estado
    canUndo,
    canRedo,
    undoSize,
    redoSize,

    // Ações
    undo,
    redo,
    clearHistory,
  };
}
