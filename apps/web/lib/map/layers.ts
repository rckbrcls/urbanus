/**
 * MapLibre layer paint/layout constants for the graph editor.
 */

import type { CircleLayerSpecification, LineLayerSpecification, SymbolLayerSpecification } from 'maplibre-gl';
import { NODE_RADIUS_ZOOM_STOPS, type NodeRadiusStop } from '@/features/map/constants';

const MISSING_ELEVATION_COLOR = '#9e9e9e';
export const DEFAULT_EDGE_COLOR = '#60a5fa';

const ELEVATION_COLOR_STOPS = [
  { value: 0, color: '#313695' },
  { value: 0.25, color: '#4575b4' },
  { value: 0.5, color: '#fee090' },
  { value: 0.75, color: '#f46d43' },
  { value: 1, color: '#a50026' },
] as const;

function hexToRgb(hex: string): [number, number, number] {
  const sanitized = hex.replace('#', '');
  const value = Number.parseInt(sanitized, 16);

  return [
    (value >> 16) & 255,
    (value >> 8) & 255,
    value & 255,
  ];
}

function interpolateChannel(start: number, end: number, ratio: number): number {
  return Math.round(start + (end - start) * ratio);
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b]
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`;
}

/**
 * Convert a normalized elevation value (0-1) into the topographic ramp used by the map.
 * We precompute colors in JS to avoid brittle runtime expression parsing in MapLibre.
 */
export function getElevationColor(normalized: number): string {
  if (!Number.isFinite(normalized) || normalized < 0) {
    return MISSING_ELEVATION_COLOR;
  }

  const clamped = Math.min(Math.max(normalized, 0), 1);

  for (let index = 0; index < ELEVATION_COLOR_STOPS.length - 1; index += 1) {
    const current = ELEVATION_COLOR_STOPS[index];
    const next = ELEVATION_COLOR_STOPS[index + 1];

    if (clamped <= next.value) {
      const ratio = (clamped - current.value) / (next.value - current.value || 1);
      const currentRgb = hexToRgb(current.color);
      const nextRgb = hexToRgb(next.color);

      return rgbToHex([
        interpolateChannel(currentRgb[0], nextRgb[0], ratio),
        interpolateChannel(currentRgb[1], nextRgb[1], ratio),
        interpolateChannel(currentRgb[2], nextRgb[2], ratio),
      ]);
    }
  }

  return ELEVATION_COLOR_STOPS[ELEVATION_COLOR_STOPS.length - 1].color;
}

export function getElevationLabel(elevation: number | null | undefined): string {
  if (elevation == null || Number.isNaN(elevation)) {
    return '';
  }

  return `${Math.round(elevation)}m`;
}

function createZoomInterpolatedRadiusExpression(
  stops: readonly NodeRadiusStop[],
): number {
  const expression: unknown[] = ['interpolate', ['linear'], ['zoom']];

  for (const [zoom, radius] of stops) {
    expression.push(zoom, radius);
  }

  return expression as unknown as number;
}

function createStateAwareNodeRadiusExpression(
  conditions: {
    selected: unknown[];
    hovered: unknown[];
    collection: unknown[];
  },
): number {
  const expression: unknown[] = ['interpolate', ['linear'], ['zoom']];

  for (const [index, [zoom, defaultRadius]] of NODE_RADIUS_ZOOM_STOPS.default.entries()) {
    const hoveredRadius = NODE_RADIUS_ZOOM_STOPS.hovered[index]?.[1] ?? defaultRadius;
    const selectedRadius = NODE_RADIUS_ZOOM_STOPS.selected[index]?.[1] ?? hoveredRadius;
    const collectionRadius = NODE_RADIUS_ZOOM_STOPS.collection[index]?.[1] ?? defaultRadius;

    expression.push(
      zoom,
      [
        'case',
        conditions.selected, selectedRadius,
        conditions.hovered, hoveredRadius,
        conditions.collection, collectionRadius,
        defaultRadius,
      ],
    );
  }

  return expression as unknown as number;
}

export const DEFAULT_NODE_RADIUS_EXPRESSION = createZoomInterpolatedRadiusExpression(
  NODE_RADIUS_ZOOM_STOPS.default,
);

export const GRAPH_NODE_RADIUS_EXPRESSION = createStateAwareNodeRadiusExpression({
  selected: ['boolean', ['feature-state', 'selected'], false],
  hovered: ['boolean', ['feature-state', 'hovered'], false],
  collection: ['==', ['get', 'isCollectionPoint'], true],
});

export const SEWER_NODE_RADIUS_EXPRESSION = createStateAwareNodeRadiusExpression({
  selected: ['==', ['get', 'is_selected'], true],
  hovered: ['boolean', ['feature-state', 'hovered'], false],
  collection: ['==', ['get', 'is_collection_point'], true],
});

// ============ NODES ============

export const NODES_PAINT: CircleLayerSpecification['paint'] = {
  'circle-radius': GRAPH_NODE_RADIUS_EXPRESSION,
  'circle-color': [
    'case',
    ['boolean', ['feature-state', 'error'], false], '#ef4444',
    ['boolean', ['feature-state', 'selected'], false], '#f97316',
    ['boolean', ['feature-state', 'hovered'], false], '#3b82f6',
    ['==', ['get', 'isCollectionPoint'], true], '#06b6d4',
    '#6b7280',
  ] as unknown as string,
  'circle-opacity': 1,
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
    ['==', ['get', 'isCollectionPoint'], true], '#004d40',
    '#fff',
  ] as unknown as string,
};

// ============ EDGES ============

/** Default: neutral uniform color */
export const EDGES_DEFAULT_PAINT: LineLayerSpecification['paint'] = {
  'line-color': [
    'case',
    ['boolean', ['feature-state', 'error'], false], '#ef4444',
    ['boolean', ['feature-state', 'selected'], false], '#f97316',
    ['boolean', ['feature-state', 'hovered'], false], '#3b82f6',
    DEFAULT_EDGE_COLOR,
  ] as unknown as string,
  'line-width': [
    'case',
    ['boolean', ['feature-state', 'selected'], false], 5,
    ['boolean', ['feature-state', 'hovered'], false], 4,
    2.5,
  ] as unknown as number,
  'line-opacity': 0.9,
};

/** Streets mode: colored by highway type */
export const EDGES_STREETS_PAINT: LineLayerSpecification['paint'] = {
  'line-color': [
    'case',
    ['boolean', ['feature-state', 'error'], false], '#ef4444',
    ['boolean', ['feature-state', 'selected'], false], '#f97316',
    ['boolean', ['feature-state', 'hovered'], false], '#3b82f6',
    ['==', ['get', 'highway'], 'motorway'], '#e11d48',
    ['==', ['get', 'highway'], 'trunk'], '#f97316',
    ['==', ['get', 'highway'], 'primary'], '#eab308',
    ['==', ['get', 'highway'], 'secondary'], '#22c55e',
    ['==', ['get', 'highway'], 'tertiary'], '#3b82f6',
    ['==', ['get', 'highway'], 'residential'], '#8b5cf6',
    '#a1a1aa',
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
    2.5,
  ] as unknown as number,
  'line-opacity': 0.9,
};

/** @deprecated Use EDGES_DEFAULT_PAINT or EDGES_STREETS_PAINT */
export const EDGES_PAINT = EDGES_STREETS_PAINT;

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

export const NODES_ELEVATION_PAINT: CircleLayerSpecification['paint'] = {
  'circle-radius': GRAPH_NODE_RADIUS_EXPRESSION,
  'circle-color': ['get', 'elevationColor'] as unknown as string,
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
  'line-color': ['get', 'elevationColor'] as unknown as string,
  'line-width': [
    'case',
    ['boolean', ['feature-state', 'selected'], false], 5,
    ['boolean', ['feature-state', 'hovered'], false], 4,
    3,
  ] as unknown as number,
  'line-opacity': 0.9,
};

export const ELEVATION_LABEL_LAYOUT: SymbolLayerSpecification['layout'] = {
  'text-field': ['get', 'elevationLabel'] as unknown as string,
  'text-size': 10,
  'text-offset': ['literal', [0, 1.5]] as unknown as [number, number],
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
  // Keep chevrons aligned with the actual LineString direction instead of
  // flipping them for text readability on reversed bearings.
  'text-keep-upright': false,
  'text-allow-overlap': true,
  'text-ignore-placement': true,
};

export const FLOW_ARROWS_PAINT: SymbolLayerSpecification['paint'] = {
  'text-color': ['coalesce', ['get', 'arrowColor'], DEFAULT_EDGE_COLOR] as unknown as string,
  'text-opacity': 0.95,
  'text-halo-color': 'rgba(255, 255, 255, 0.9)',
  'text-halo-width': 1.1,
};
