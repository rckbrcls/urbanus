export const DEFAULT_CENTER: [number, number] = [-23.5505, -46.6333]; // São Paulo, Brasil
export const DEFAULT_ZOOM = 13;

export const ELEVATION_CACHE = {
  TTL_MS: 30 * 60 * 1000, // 30 minutos
  MAX_ENTRIES: 10,
} as const;

export const KEYBOARD_SHORTCUTS = {
  CANCEL: "Escape",
  UNDO: "z",
  SELECT_ALL: "a",
  DELETE: "Delete",
} as const;
