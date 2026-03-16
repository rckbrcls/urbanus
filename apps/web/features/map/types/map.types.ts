/**
 * Tipos gerais do mapa
 */

// Re-export canonical geo types from @urbanus/geo
export type {
  LatLng,
  BoundingBox,
  ValidationError,
  ValidationWarning,
  BboxDimensions,
} from "@urbanus/geo";

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
  onBoundingBoxChange?: (bbox: import("@urbanus/geo").BoundingBox | null) => void;
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
