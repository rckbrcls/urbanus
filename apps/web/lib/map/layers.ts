/**
 * MapLibre layer paint/layout constants for the graph editor.
 */

import type { CircleLayerSpecification, LineLayerSpecification, SymbolLayerSpecification } from 'maplibre-gl';

// ============ NODES ============

export const NODES_PAINT: CircleLayerSpecification['paint'] = {
  'circle-radius': [
    'case',
    ['boolean', ['feature-state', 'selected'], false], 10,
    ['boolean', ['feature-state', 'hovered'], false], 9,
    7,
  ] as unknown as number,
  'circle-color': [
    'case',
    ['boolean', ['feature-state', 'error'], false], '#ef4444',
    ['boolean', ['feature-state', 'selected'], false], '#f97316',
    ['boolean', ['feature-state', 'hovered'], false], '#3b82f6',
    // By classification
    ['==', ['get', 'isCollectionPoint'], true], '#00bcd4',
    ['==', ['get', 'isHighestElevation'], true], '#ef4444',
    ['==', ['get', 'isLowestElevation'], true], '#06b6d4',
    ['==', ['get', 'isEndpoint'], true], '#f59e0b',
    '#8b5cf6', // default — intersection
  ] as unknown as string,
  'circle-opacity': [
    'case',
    ['boolean', ['feature-state', 'selected'], false], 1,
    0.85,
  ] as unknown as number,
  'circle-stroke-width': [
    'case',
    ['boolean', ['feature-state', 'selected'], false], 3,
    ['boolean', ['feature-state', 'hovered'], false], 2,
    1,
  ] as unknown as number,
  'circle-stroke-color': [
    'case',
    ['boolean', ['feature-state', 'selected'], false], '#fff',
    ['boolean', ['feature-state', 'hovered'], false], '#fff',
    'rgba(255, 255, 255, 0.6)',
  ] as unknown as string,
};

// ============ EDGES ============

export const EDGES_PAINT: LineLayerSpecification['paint'] = {
  'line-color': [
    'case',
    ['boolean', ['feature-state', 'error'], false], '#ef4444',
    ['boolean', ['feature-state', 'selected'], false], '#f97316',
    ['boolean', ['feature-state', 'hovered'], false], '#3b82f6',
    // Highway-based colors (consistent with HIGHWAY_COLORS from MapView)
    ['==', ['get', 'highway'], 'motorway'], '#e11d48',
    ['==', ['get', 'highway'], 'trunk'], '#f97316',
    ['==', ['get', 'highway'], 'primary'], '#eab308',
    ['==', ['get', 'highway'], 'secondary'], '#22c55e',
    ['==', ['get', 'highway'], 'tertiary'], '#3b82f6',
    ['==', ['get', 'highway'], 'residential'], '#8b5cf6',
    '#a1a1aa', // default/unclassified (zinc-400 — visible on dark maps)
  ] as unknown as string,
  'line-width': [
    'case',
    ['boolean', ['feature-state', 'selected'], false], 5,
    ['boolean', ['feature-state', 'hovered'], false], 4,
    ['any',
      ['==', ['get', 'highway'], 'motorway'],
      ['==', ['get', 'highway'], 'trunk'],
    ], 4,
    ['any',
      ['==', ['get', 'highway'], 'primary'],
      ['==', ['get', 'highway'], 'secondary'],
    ], 3,
    2.5, // tertiary, residential, default
  ] as unknown as number,
  'line-opacity': 0.9,
};

export const EDGES_LAYOUT: LineLayerSpecification['layout'] = {
  'line-cap': 'round',
  'line-join': 'round',
};

// ============ GHOST EDGE (add-edge preview) ============

export const GHOST_EDGE_PAINT: LineLayerSpecification['paint'] = {
  'line-color': '#3b82f6',
  'line-width': 2,
  'line-dasharray': [4, 4],
  'line-opacity': 0.6,
};

// ============ ELEVATION VIEW ============

/** Topographic color ramp (RdYlBu reversed): blue=low → red=high */
const ELEVATION_COLOR = [
  'case',
  ['==', ['get', 'elevation_normalized'], -1], '#9e9e9e',
  [
    'interpolate', ['linear'], ['get', 'elevation_normalized'],
    0.0, '#313695',
    0.25, '#4575b4',
    0.5, '#fee090',
    0.75, '#f46d43',
    1.0, '#a50026',
  ],
] as unknown;

export const NODES_ELEVATION_PAINT: CircleLayerSpecification['paint'] = {
  'circle-radius': [
    'case',
    ['boolean', ['feature-state', 'selected'], false], 10,
    ['boolean', ['feature-state', 'hovered'], false], 9,
    ['==', ['get', 'isCollectionPoint'], true], 10,
    7,
  ] as unknown as number,
  'circle-color': ELEVATION_COLOR as string,
  'circle-opacity': 1,
  'circle-stroke-width': [
    'case',
    ['boolean', ['feature-state', 'selected'], false], 3,
    ['boolean', ['feature-state', 'hovered'], false], 2,
    1,
  ] as unknown as number,
  'circle-stroke-color': '#ffffff',
};

export const EDGES_ELEVATION_PAINT: LineLayerSpecification['paint'] = {
  'line-color': ELEVATION_COLOR as string,
  'line-width': [
    'case',
    ['boolean', ['feature-state', 'selected'], false], 5,
    ['boolean', ['feature-state', 'hovered'], false], 4,
    3,
  ] as unknown as number,
  'line-opacity': 0.9,
};

export const ELEVATION_LABEL_LAYOUT: SymbolLayerSpecification['layout'] = {
  'text-field': [
    'case',
    ['==', ['get', 'elevation_normalized'], -1], '',
    ['concat', ['to-string', ['round', ['get', 'elevation']]], 'm'],
  ],
  'text-size': 10,
  'text-offset': [0, 1.5],
  'text-allow-overlap': false,
  'text-optional': true,
};

export const ELEVATION_LABEL_PAINT: SymbolLayerSpecification['paint'] = {
  'text-color': '#1e293b',
  'text-halo-color': '#ffffff',
  'text-halo-width': 1.5,
};

// ============ FLOW ARROWS ============

export const FLOW_ARROWS_LAYOUT: SymbolLayerSpecification['layout'] = {
  'symbol-placement': 'line',
  'symbol-spacing': 80,
  'text-field': '▶',
  'text-size': 12,
  'text-rotation-alignment': 'map',
  'text-allow-overlap': true,
  'text-ignore-placement': true,
};

export const FLOW_ARROWS_PAINT: SymbolLayerSpecification['paint'] = {
  'text-color': '#475569',
  'text-opacity': 0.7,
};
