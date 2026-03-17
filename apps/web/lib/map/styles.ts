/**
 * Map style URLs for MapLibre GL JS.
 *
 * Uses Carto's GL-native vector tile styles (same provider as the old Leaflet raster tiles).
 */

export const MAP_STYLES = {
  /** Light basemap — good for most workflows */
  voyager:
    'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',

  /** Light, no labels — useful for the project editor overlay */
  voyagerNoLabels:
    'https://basemaps.cartocdn.com/gl/voyager-nolabels-style/style.json',

  /** Minimal positron (gray) */
  positron:
    'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',

  /** Dark basemap */
  darkMatter:
    'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
} as const;

export type MapStyleKey = keyof typeof MAP_STYLES;
