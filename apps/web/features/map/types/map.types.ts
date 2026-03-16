/**
 * Tipos gerais do mapa
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface BoundingBox {
  southWest: LatLng;
  northEast: LatLng;
}

export interface ValidationError {
  code: string;
  message: string;
  field?: string;
}

export interface ValidationWarning {
  code: string;
  message: string;
}

export interface BboxDimensions {
  widthKm: number;
  heightKm: number;
}

export interface ProcessingStages {
  streets: "pending" | "loading" | "success" | "error";
  topography: "pending" | "loading" | "success" | "error" | "skipped";
  nodes: "pending" | "loading" | "success" | "error";
}

export interface ProcessingErrors {
  streets?: string;
  topography?: string;
  nodes?: string;
}

export interface MapContainerProps {
  center?: [number, number];
  zoom?: number;
  onBoundingBoxChange?: (bbox: BoundingBox | null) => void;
  enableBoundingBox?: boolean;
}

export type ViewMode = "explore" | "select" | "edit" | "cropped";

export type ProcessingStage =
  | "idle"
  | "fetching-streets"
  | "fetching-topography"
  | "processing"
  | "complete"
  | "error";

export interface MapError {
  code: string;
  message: string;
  timestamp: number;
  severity: "warning" | "error";
}
