/**
 * Constantes do módulo de mapas
 *
 * Centraliza todas as configurações e constantes para facilitar manutenção
 */

// ============ COORDENADAS PADRÃO ============

export const DEFAULT_CENTER: [number, number] = [-23.5505, -46.6333]; // São Paulo, Brasil
export const DEFAULT_ZOOM = 13;

// ============ LIMITES DE ÁREA ============

export const AREA_LIMITS = {
  MAX_BBOX_AREA_KM2: 100,
  MIN_BBOX_AREA_KM2: 0.001,
  BBOX_AREA_WARNING_THRESHOLD: 50,
} as const;

// Para compatibilidade com código existente
export const MAX_AREA_KM2 = AREA_LIMITS.MAX_BBOX_AREA_KM2;

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

interface NodeStyleEntry {
  color: string;
  radius: number;
  fillOpacity: number;
}

export const NODE_STYLES: Record<string, NodeStyleEntry> = {
  default: {
    color: "#6b7280", // gray-500
    radius: 4,
    fillOpacity: 0.8,
  },
  endpoint: {
    color: "#f59e0b", // amber-500
    radius: 5,
    fillOpacity: 0.9,
  },
  selected: {
    color: "#3b82f6", // blue-500
    radius: 7,
    fillOpacity: 1,
  },
  hovered: {
    color: "#8b5cf6", // violet-500
    radius: 6,
    fillOpacity: 0.9,
  },
  dragging: {
    color: "#22c55e", // green-500
    radius: 8,
    fillOpacity: 0.7,
  },
  invalid: {
    color: "#ef4444", // red-500
    radius: 7,
    fillOpacity: 0.8,
  },
};

// ============ RESTRIÇÕES DE NÓS ============

export const NODE_CONSTRAINTS = {
  MIN_DISTANCE_METERS: 1, // Distância mínima entre nós
  MAX_MOVE_DISTANCE_METERS: 500, // Distância máxima de movimento único
  SNAP_DISTANCE_METERS: 5, // Distância para snap automático
} as const;

// ============ CACHE DE ELEVAÇÃO ============

export const ELEVATION_CACHE = {
  TTL_MS: 30 * 60 * 1000, // 30 minutos
  MAX_ENTRIES: 10,
} as const;

// ============ RATE LIMITING ============

export const RATE_LIMITS = {
  STREETS_FETCH: {
    maxRequests: 10,
    windowMs: 60000, // 10 req/min
  },
  TOPOGRAPHY_FETCH: {
    maxRequests: 5,
    windowMs: 60000, // 5 req/min
  },
  NODE_OPERATIONS: {
    maxRequests: 100,
    windowMs: 60000, // 100 ops/min
  },
} as const;

// ============ ATALHOS DE TECLADO ============

export const KEYBOARD_SHORTCUTS = {
  CANCEL: "Escape",
  UNDO: "z",
  SELECT_ALL: "a",
  DELETE: "Delete",
} as const;
