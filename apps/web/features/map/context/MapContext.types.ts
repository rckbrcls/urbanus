/**
 * Tipos do MapContext
 */

import type {
  LatLng,
  BoundingBox,
  ProcessingStages,
  ProcessingErrors,
  ViewMode,
  NodeEditMode,
  MapNode,
  EnrichedFeatureCollection,
} from "../types";
import type L from "leaflet";

// ============ STATE TYPES ============

export interface MapState {
  // Instância do mapa
  map: L.Map | null;
  isReady: boolean;

  // Modo de visualização
  viewMode: ViewMode;

  // Bounding Box
  pendingBbox: BoundingBox | null;
  activeBbox: BoundingBox | null;
  bboxArea: number;

  // Posição
  center: [number, number];
  zoom: number;

  // Processamento
  isProcessing: boolean;
  stages: ProcessingStages;
  errors: ProcessingErrors;

  // Dados
  streetsData: EnrichedFeatureCollection | null;
  streetCount: number;

  // Edição de nós
  nodes: MapNode[];
  nodeEditMode: NodeEditMode;
  selectedNodeIds: string[];
  hoveredNodeId: string | null;

  // UI
  showCropConfirm: boolean;
  showSaveDialog: boolean;
  validationError: string | null;
}

export interface MapActions {
  // Map instance
  setMap: (map: L.Map | null) => void;
  setIsReady: (ready: boolean) => void;

  // View mode
  setViewMode: (mode: ViewMode) => void;

  // Bounding Box
  setPendingBbox: (bbox: BoundingBox | null, area?: number) => void;
  confirmBbox: () => void;
  cancelBbox: () => void;
  clearBbox: () => void;

  // Position
  setPosition: (center: [number, number], zoom: number) => void;

  // Processing
  startProcessing: () => Promise<void>;
  cancelProcessing: () => void;

  // Nodes
  setNodes: (nodes: MapNode[]) => void;
  setNodeEditMode: (mode: NodeEditMode) => void;
  selectNode: (nodeId: string, addToSelection?: boolean) => void;
  selectNodes: (nodeIds: string[]) => void;
  clearSelection: () => void;
  setHoveredNode: (nodeId: string | null) => void;
  moveNode: (nodeId: string, position: LatLng) => Promise<void>;
  deleteNode: (nodeId: string) => void;
  deleteSelected: () => void;
  undo: () => void;
  redo: () => void;

  // Data
  setStreetsData: (data: EnrichedFeatureCollection | null) => void;
  enrichStreetsWithElevation: () => Promise<void>;
  applyNodeChanges: () => EnrichedFeatureCollection | null;

  // UI
  setShowCropConfirm: (show: boolean) => void;
  setShowSaveDialog: (show: boolean) => void;
  setValidationError: (error: string | null) => void;

  // Reset
  reset: () => void;
}

export type MapContextValue = MapState & MapActions;

// ============ INITIAL STATE ============

export const initialMapState: MapState = {
  // Instância
  map: null,
  isReady: false,

  // View
  viewMode: "explore",

  // Bbox
  pendingBbox: null,
  activeBbox: null,
  bboxArea: 0,

  // Position
  center: [-23.5505, -46.6333], // São Paulo
  zoom: 13,

  // Processing
  isProcessing: false,
  stages: {
    streets: "pending",
    topography: "pending",
    nodes: "pending",
  },
  errors: {},

  // Data
  streetsData: null,
  streetCount: 0,

  // Nodes
  nodes: [],
  nodeEditMode: "none",
  selectedNodeIds: [],
  hoveredNodeId: null,

  // UI
  showCropConfirm: false,
  showSaveDialog: false,
  validationError: null,
};

// ============ REDUCER ============

export type MapAction =
  | { type: "SET_MAP"; payload: L.Map | null }
  | { type: "SET_IS_READY"; payload: boolean }
  | { type: "SET_VIEW_MODE"; payload: ViewMode }
  | {
      type: "SET_PENDING_BBOX";
      payload: { bbox: BoundingBox | null; area?: number };
    }
  | { type: "CONFIRM_BBOX" }
  | { type: "CANCEL_BBOX" }
  | { type: "CLEAR_BBOX" }
  | {
      type: "SET_POSITION";
      payload: { center: [number, number]; zoom: number };
    }
  | { type: "SET_PROCESSING"; payload: boolean }
  | { type: "SET_STAGES"; payload: Partial<ProcessingStages> }
  | { type: "SET_ERRORS"; payload: Partial<ProcessingErrors> }
  | { type: "SET_STREETS_DATA"; payload: EnrichedFeatureCollection | null }
  | { type: "SET_STREET_COUNT"; payload: number }
  | { type: "SET_NODES"; payload: MapNode[] }
  | { type: "SET_NODE_EDIT_MODE"; payload: NodeEditMode }
  | { type: "SET_SELECTED_NODE_IDS"; payload: string[] }
  | { type: "SET_HOVERED_NODE_ID"; payload: string | null }
  | { type: "SET_SHOW_CROP_CONFIRM"; payload: boolean }
  | { type: "SET_SHOW_SAVE_DIALOG"; payload: boolean }
  | { type: "SET_VALIDATION_ERROR"; payload: string | null }
  | { type: "RESET" };

export function mapReducer(state: MapState, action: MapAction): MapState {
  switch (action.type) {
    case "SET_MAP":
      return { ...state, map: action.payload };

    case "SET_IS_READY":
      return { ...state, isReady: action.payload };

    case "SET_VIEW_MODE":
      return { ...state, viewMode: action.payload };

    case "SET_PENDING_BBOX":
      return {
        ...state,
        pendingBbox: action.payload.bbox,
        bboxArea: action.payload.area ?? state.bboxArea,
        showCropConfirm: action.payload.bbox !== null,
        validationError: null,
      };

    case "CONFIRM_BBOX":
      if (!state.pendingBbox) return state;
      return {
        ...state,
        activeBbox: state.pendingBbox,
        pendingBbox: null,
        viewMode: "cropped",
        showCropConfirm: false,
      };

    case "CANCEL_BBOX":
      return {
        ...state,
        pendingBbox: null,
        showCropConfirm: false,
      };

    case "CLEAR_BBOX":
      return {
        ...state,
        pendingBbox: null,
        activeBbox: null,
        bboxArea: 0,
        viewMode: "explore",
        showCropConfirm: false,
        streetsData: null,
        nodes: [],
        streetCount: 0,
        stages: { streets: "pending", topography: "pending", nodes: "pending" },
        errors: {},
      };

    case "SET_POSITION":
      return {
        ...state,
        center: action.payload.center,
        zoom: action.payload.zoom,
      };

    case "SET_PROCESSING":
      return { ...state, isProcessing: action.payload };

    case "SET_STAGES":
      return { ...state, stages: { ...state.stages, ...action.payload } };

    case "SET_ERRORS":
      return { ...state, errors: { ...state.errors, ...action.payload } };

    case "SET_STREETS_DATA":
      return {
        ...state,
        streetsData: action.payload,
        streetCount: action.payload?.features.length ?? 0,
      };

    case "SET_STREET_COUNT":
      return { ...state, streetCount: action.payload };

    case "SET_NODES":
      return { ...state, nodes: action.payload };

    case "SET_NODE_EDIT_MODE":
      return { ...state, nodeEditMode: action.payload };

    case "SET_SELECTED_NODE_IDS":
      return { ...state, selectedNodeIds: action.payload };

    case "SET_HOVERED_NODE_ID":
      return { ...state, hoveredNodeId: action.payload };

    case "SET_SHOW_CROP_CONFIRM":
      return { ...state, showCropConfirm: action.payload };

    case "SET_SHOW_SAVE_DIALOG":
      return { ...state, showSaveDialog: action.payload };

    case "SET_VALIDATION_ERROR":
      return { ...state, validationError: action.payload };

    case "RESET":
      return { ...initialMapState, map: state.map, isReady: state.isReady };

    default:
      return state;
  }
}
