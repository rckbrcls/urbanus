/**
 * Constantes do módulo de mapas
 *
 * Shared constants re-exported from @urbanus/constants.
 * UI-specific constants (colors, styles) remain here.
 */

// Re-export shared constants
export {
  AREA_LIMITS,
  MAX_AREA_KM2,
  NODE_CONSTRAINTS,
  RATE_LIMITS,
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  ELEVATION_CACHE,
  KEYBOARD_SHORTCUTS,
} from "@urbanus/constants";

// ============ ESTILOS DE BOUNDING BOX ============

export const BBOX_COLORS = {
  valid: "#3b82f6", // blue-500
  invalid: "#ef4444", // red-500
  confirmed: "#22c55e", // green-500
  drawing: "#8b5cf6", // violet-500
} as const;

export const MAP_STYLES = {
  rectangle: {
    valid: {
      color: BBOX_COLORS.valid,
      fillColor: BBOX_COLORS.valid,
      weight: 2,
      fillOpacity: 0.1,
    },
    invalid: {
      color: BBOX_COLORS.invalid,
      fillColor: BBOX_COLORS.invalid,
      weight: 2,
      fillOpacity: 0.1,
    },
    confirmed: {
      color: BBOX_COLORS.confirmed,
      fillColor: BBOX_COLORS.confirmed,
      weight: 2,
      fillOpacity: 0.15,
    },
  },
} as const;

// ============ CORES DE HIGHWAY ============

export const HIGHWAY_COLORS: Record<string, string> = {
  motorway: "#e11d48", // red
  trunk: "#f97316", // orange
  primary: "#eab308", // yellow
  secondary: "#22c55e", // green
  tertiary: "#3b82f6", // blue
  residential: "#8b5cf6", // purple
  unclassified: "#6b7280", // gray
  default: "#6b7280", // gray
};

export const HIGHWAY_WEIGHTS: Record<string, number> = {
  motorway: 4,
  trunk: 4,
  primary: 3,
  secondary: 3,
  tertiary: 2,
  residential: 2,
  unclassified: 2,
  default: 2,
};
