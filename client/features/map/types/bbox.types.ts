/**
 * Tipos de Bounding Box
 */

import {
  LatLng,
  ValidationError,
  ValidationWarning,
  BboxDimensions,
} from "./map.types";

export interface BboxValidationResult {
  valid: boolean;
  errors: BboxValidationError[];
  warnings: BboxValidationWarning[];
  metadata?: BboxMetadata;
}

export interface BboxValidationError {
  code: BboxErrorCode;
  message: string;
  field?: string;
}

export interface BboxValidationWarning {
  code: BboxWarningCode;
  message: string;
}

export interface BboxMetadata {
  area: number;
  center: LatLng;
  dimensions: {
    widthKm: number;
    heightKm: number;
  };
}

export type BboxErrorCode =
  | "INVALID_FORMAT"
  | "INVALID_SOUTHWEST"
  | "INVALID_NORTHEAST"
  | "INVALID_LATITUDE"
  | "INVALID_LONGITUDE"
  | "INVALID_LAT_ORDER"
  | "INVALID_LNG_ORDER"
  | "AREA_TOO_LARGE"
  | "AREA_TOO_SMALL";

export type BboxWarningCode = "LARGE_AREA" | "CLOSE_TO_LIMIT";

export interface BboxSelectionState {
  isDrawing: boolean;
  startPoint: LatLng | null;
  currentBbox: { southWest: LatLng; northEast: LatLng } | null;
  validation: BboxValidationResult | null;
}
