/**
 * Hook de Atalhos de Teclado do Mapa
 *
 * Gerencia atalhos de teclado globais para o mapa
 */

import { useEffect, useCallback } from "react";
import { useMapContext } from "../context/MapContext";
import { KEYBOARD_SHORTCUTS } from "../constants";

interface UseMapKeyboardOptions {
  enabled?: boolean;
}

export function useMapKeyboard({ enabled = true }: UseMapKeyboardOptions = {}) {
  const {
    viewMode,
    nodeEditMode,
    selectedNodeIds,
    clearSelection,
    deleteSelected,
    undo,
    redo,
    setNodeEditMode,
    clearBbox,
  } = useMapContext();

  const isEditing = viewMode === "cropped" || viewMode === "edit";
  const hasSelection = selectedNodeIds.length > 0;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled || !isEditing) return;

      // Ignorar se foco está em input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      // ============ UNDO/REDO ============
      if (isCtrlOrCmd && e.key === KEYBOARD_SHORTCUTS.UNDO && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }

      if (isCtrlOrCmd && e.key === KEYBOARD_SHORTCUTS.UNDO && e.shiftKey) {
        e.preventDefault();
        redo();
        return;
      }

      if (isCtrlOrCmd && e.key === "y") {
        e.preventDefault();
        redo();
        return;
      }

      // ============ SELECTION ============
      if (isCtrlOrCmd && e.key === KEYBOARD_SHORTCUTS.SELECT_ALL) {
        e.preventDefault();
        // TODO: selectAll via context
        return;
      }

      // ============ DELETE ============
      if (e.key === KEYBOARD_SHORTCUTS.DELETE || e.key === "Backspace") {
        if (hasSelection) {
          e.preventDefault();
          deleteSelected();
        }
        return;
      }

      // ============ CANCEL/ESCAPE ============
      if (e.key === KEYBOARD_SHORTCUTS.CANCEL) {
        e.preventDefault();
        if (hasSelection) {
          clearSelection();
        } else if (nodeEditMode !== "none") {
          setNodeEditMode("none");
        } else {
          clearBbox();
        }
        return;
      }

      // ============ EDIT MODE SHORTCUTS ============
      if (e.key === "v" || e.key === "V") {
        setNodeEditMode("select");
        return;
      }

      if (e.key === "m" || e.key === "M") {
        setNodeEditMode("move");
        return;
      }

      if (e.key === "d" || e.key === "D") {
        setNodeEditMode("delete");
        return;
      }

      if (e.key === "n" || e.key === "N") {
        setNodeEditMode("add");
        return;
      }
    },
    [
      enabled,
      isEditing,
      hasSelection,
      nodeEditMode,
      undo,
      redo,
      deleteSelected,
      clearSelection,
      setNodeEditMode,
      clearBbox,
    ],
  );

  useEffect(() => {
    if (!enabled) return;

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, handleKeyDown]);

  return {
    shortcuts: {
      undo: "Ctrl+Z",
      redo: "Ctrl+Shift+Z",
      delete: "Delete",
      escape: "Esc",
      selectMode: "V",
      moveMode: "M",
      deleteMode: "D",
      addMode: "N",
    },
  };
}
