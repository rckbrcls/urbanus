// Cores para diferentes tipos de vias
export const HIGHWAY_COLORS: Record<string, string> = {
  motorway: "#e11d48",
  trunk: "#f97316",
  primary: "#eab308",
  secondary: "#22c55e",
  tertiary: "#3b82f6",
  residential: "#8b5cf6",
  unclassified: "#6b7280",
};

// Área máxima permitida em km²
export const MAX_AREA_KM2 = 100;

// Configurações de estilo do mapa
export const MAP_STYLES = {
  rectangle: {
    valid: {
      color: "#3b82f6",
      fillColor: "#3b82f6",
      weight: 2,
      fillOpacity: 0.1,
    },
    invalid: {
      color: "#ef4444",
      fillColor: "#ef4444",
      weight: 2,
      fillOpacity: 0.1,
    },
  },
};
