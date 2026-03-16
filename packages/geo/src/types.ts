/**
 * Core geospatial types — canonical definitions.
 *
 * These are the single source of truth for LatLng, BoundingBox,
 * and validation result types across the JS/TS codebase.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface BoundingBox {
  southWest: LatLng;
  northEast: LatLng;
}

export interface BboxDimensions {
  widthKm: number;
  heightKm: number;
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

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings?: ValidationWarning[];
}
