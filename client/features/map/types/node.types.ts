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
  highway?: string;
  isEndpoint: boolean;
  isIntersection?: boolean;
  connectedStreets?: string[];
  degree?: number;
  isHighestElevation?: boolean;
  isLowestElevation?: boolean;

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

/**
 * Resposta do endpoint /nodes/extract (backend Python)
 */
export interface NodesExtractResponse {
  nodes: Array<{
    id: string;
    position: { lat: number; lng: number };
    elevation: number | null;
    degree: number;
    isIntersection: boolean;
    isEndpoint: boolean;
    connectedStreets: string[];
    streetNames: string[];
    isHighestElevation: boolean;
    isLowestElevation: boolean;
  }>;
  metadata: {
    totalVertices: number;
    totalUniquePositions: number;
    filteredNodes: number;
    highestElevationNodeId: string | null;
    lowestElevationNodeId: string | null;
    highestElevation: number | null;
    lowestElevation: number | null;
  };
}
