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
    '#64748b', // default — slate
  ] as unknown as string,
  'line-width': [
    'case',
    ['boolean', ['feature-state', 'selected'], false], 4,
    ['boolean', ['feature-state', 'hovered'], false], 3,
    2,
  ] as unknown as number,
  'line-opacity': 0.8,
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
