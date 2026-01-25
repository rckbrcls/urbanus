/**
 * Tipos de Nó
 */

import { LatLng } from "./map.types";

/**
 * Representa um nó no mapa (vértice de uma rua)
 */
export interface MapNode {
  id: string;
  position: LatLng;
  elevation: number | null;

  // Identificação
  streetId: string;
  streetName?: string;
  vertexIndex: number;

  // Características
  isEndpoint: boolean;
  isIntersection?: boolean;
  connectedStreets?: string[];

  // Estado de UI
  isSelected: boolean;
  isHovered: boolean;
  isDragging: boolean;
  isLocked?: boolean;

  // Timestamps
  createdAt: number;
  updatedAt: number;
}

/**
 * Ação de edição de nó (para histórico/undo/redo)
 */
export interface NodeAction {
  type: "move" | "delete" | "create" | "batch";
  nodeId: string;
  previousState: Partial<MapNode> & Record<string, unknown>;
  newState: Partial<MapNode> & Record<string, unknown>;
  timestamp: number;
  batchActions?: NodeAction[];
}

/**
 * Resultado de validação de movimento
 */
export interface MoveValidationResult {
  valid: boolean;
  errors: NodeValidationError[];
  warnings: NodeValidationWarning[];
  snapSuggestion?: LatLng;
}

export interface NodeValidationError {
  code: NodeErrorCode;
  message: string;
}

export interface NodeValidationWarning {
  code: NodeWarningCode;
  message: string;
}

export type NodeErrorCode =
  | "OUTSIDE_BOUNDS"
  | "CANNOT_DELETE_ENDPOINT"
  | "NODE_NOT_FOUND"
  | "NODE_LOCKED"
  | "INVALID_POSITION";

export type NodeWarningCode =
  | "TOO_CLOSE"
  | "LARGE_MOVE"
  | "INTERSECTION_MODIFIED";

/**
 * Opções de visualização de nós
 */
export interface NodeDisplayOptions {
  showAll: boolean;
  showOnlySelected: boolean;
  showElevation: boolean;
  highlightEndpoints: boolean;
  highlightIntersections: boolean;

  // Estilos
  defaultRadius: number;
  selectedRadius: number;
  defaultColor: string;
  selectedColor: string;
  endpointColor: string;
  intersectionColor: string;
}

/**
 * Modo de edição de nós
 */
export type NodeEditMode = "none" | "select" | "move" | "delete" | "add";

/**
 * Estado da seleção de nós
 */
export interface NodeSelectionState {
  selectedIds: Set<string>;
  hoveredId: string | null;
  lastSelectedId: string | null;
  selectionBbox: {
    southWest: LatLng;
    northEast: LatLng;
  } | null;
}

/**
 * Opções para operações de seleção
 */
export interface SelectionOptions {
  addToSelection?: boolean;
  clearOthers?: boolean;
  toggle?: boolean;
}

/**
 * Resultado de operação em batch
 */
export interface BatchResult<T> {
  success: T[];
  failed: Array<{ id: string; error: string }>;
}
