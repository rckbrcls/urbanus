/**
 * Map style URLs for MapLibre GL JS.
 *
 * Uses OpenFreeMap — free, no API key, CORS-friendly.
 * @see https://openfreemap.org
 */

export const MAP_STYLES = {
  /** Light basemap with labels — good for most workflows */
  voyager:
    'https://tiles.openfreemap.org/styles/liberty',

  /** Light, minimal labels — useful for the project editor overlay */
  voyagerNoLabels:
    'https://tiles.openfreemap.org/styles/positron',

  /** Minimal positron (gray) */
  positron:
    'https://tiles.openfreemap.org/styles/positron',

  /** Dark basemap */
  darkMatter:
    'https://tiles.openfreemap.org/styles/dark',
} as const;

export type MapStyleKey = keyof typeof MAP_STYLES;
