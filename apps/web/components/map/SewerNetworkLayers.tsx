'use client';

import { useMemo } from 'react';
import { Source, Layer } from 'react-map-gl/maplibre';
import type { SewerNetwork } from '@/types/sewer';
import type { CircleLayerSpecification, LineLayerSpecification, SymbolLayerSpecification } from 'maplibre-gl';
import FlowArrows from './FlowArrows';

export type SewerViewMode = 'type' | 'elevation';

interface SewerNetworkLayersProps {
  network: SewerNetwork;
  viewMode?: SewerViewMode;
  elevationRange?: { min: number; max: number } | null;
}

const NODE_COLORS: Record<string, string> = {
  ROSA: '#e91e63',
  VERDE: '#4caf50',
  AMARELO: '#ffc107',
  AZUL_ESCURO: '#1565c0',
};

/** Map pipe diameter to line width */
function diameterToWidth(dn: number): number {
  if (dn <= 150) return 3;
  if (dn <= 300) return 5;
  if (dn <= 500) return 7;
  return 9;
}

/** Map pipe diameter to color (blue gradient — thicker = darker, more saturated) */
function diameterToColor(dn: number): string {
  if (dn <= 150) return '#42a5f5';
  if (dn <= 200) return '#2196f3';
  if (dn <= 300) return '#1976d2';
  if (dn <= 500) return '#1565c0';
  return '#0d47a1';
}

/** Normalize elevation to 0-1 range. Returns -1 for null/missing. */
function normalizeElevation(
  elevation: number | null | undefined,
  min: number,
  range: number,
): number {
  if (elevation == null) return -1;
  return range === 0 ? 0 : (elevation - min) / range;
}

// ============ ELEVATION PAINT EXPRESSIONS (RdYlBu reversed — topographic) ============

const ELEVATION_COLOR_EXPR = [
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

const EDGE_ELEVATION_COLOR_EXPR = [
  'case',
  ['==', ['get', 'avg_elevation_normalized'], -1], '#9e9e9e',
  [
    'interpolate', ['linear'], ['get', 'avg_elevation_normalized'],
    0.0, '#313695',
    0.25, '#4575b4',
    0.5, '#fee090',
    0.75, '#f46d43',
    1.0, '#a50026',
  ],
] as unknown;

export default function SewerNetworkLayers({
  network,
  viewMode = 'type',
  elevationRange,
}: SewerNetworkLayersProps) {
  const isElevation = viewMode === 'elevation';
  const range = elevationRange
    ? elevationRange.max - elevationRange.min || 1
    : 1;
  const min = elevationRange?.min ?? 0;

  const { nodesGeoJSON, edgesGeoJSON } = useMemo(() => {
    const pipeLookup = new Map(network.pipes.map((p) => [p.edge_id, p]));

    const nodeFeatures: GeoJSON.Feature[] = network.nodes.map((n) => ({
      type: 'Feature',
      id: n.id,
      geometry: { type: 'Point', coordinates: [n.lng, n.lat] },
      properties: {
        id: n.id,
        node_type: n.node_type ?? 'OTHER',
        accessory_type: n.accessory_type ?? '',
        elevation: n.elevation,
        elevation_normalized: normalizeElevation(n.elevation, min, range),
        pv_obrigatorio: n.pv_obrigatorio,
        color: NODE_COLORS[n.node_type ?? ''] ?? '#9e9e9e',
      },
    }));

    const edgeFeatures: GeoJSON.Feature[] = network.edges.map((e) => {
      const src = network.nodes.find((n) => n.id === e.source_node_id);
      const tgt = network.nodes.find((n) => n.id === e.target_node_id);
      const pipe = pipeLookup.get(e.id) ?? pipeLookup.get(`${e.source_node_id}->${e.target_node_id}`);

      // Average elevation of the two endpoints for edge coloring
      const srcElev = src?.elevation;
      const tgtElev = tgt?.elevation;
      let avgElevNorm = -1;
      if (srcElev != null && tgtElev != null) {
        avgElevNorm = normalizeElevation((srcElev + tgtElev) / 2, min, range);
      } else if (srcElev != null) {
        avgElevNorm = normalizeElevation(srcElev, min, range);
      } else if (tgtElev != null) {
        avgElevNorm = normalizeElevation(tgtElev, min, range);
      }

      return {
        type: 'Feature',
        id: e.id,
        geometry: {
          type: 'LineString',
          coordinates: [
            [src?.lng ?? 0, src?.lat ?? 0],
            [tgt?.lng ?? 0, tgt?.lat ?? 0],
          ],
        },
        properties: {
          id: e.id,
          diameter_mm: pipe?.diameter_mm ?? 150,
          is_pressurized: pipe?.is_pressurized ?? false,
          width: diameterToWidth(pipe?.diameter_mm ?? 150),
          color: pipe?.is_pressurized ? '#ff5722' : diameterToColor(pipe?.diameter_mm ?? 150),
          slope: e.slope,
          avg_elevation_normalized: avgElevNorm,
        },
      };
    });

    return {
      nodesGeoJSON: { type: 'FeatureCollection' as const, features: nodeFeatures },
      edgesGeoJSON: { type: 'FeatureCollection' as const, features: edgeFeatures },
    };
  }, [network, min, range]);

  // ============ PAINT OBJECTS ============

  const pipesPaint: LineLayerSpecification['paint'] = isElevation
    ? {
        'line-color': EDGE_ELEVATION_COLOR_EXPR as string,
        'line-width': ['get', 'width'] as unknown as number,
        'line-opacity': 0.95,
      }
    : {
        'line-color': ['get', 'color'],
        'line-width': ['get', 'width'],
        'line-opacity': 0.95,
      };

  const nodesPaint: CircleLayerSpecification['paint'] = isElevation
    ? {
        'circle-radius': 6,
        'circle-color': ELEVATION_COLOR_EXPR as string,
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#ffffff',
      }
    : {
        'circle-radius': 6,
        'circle-color': ['get', 'color'],
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#ffffff',
      };

  const elevationLabelLayout: SymbolLayerSpecification['layout'] = {
    'text-field': [
      'case',
      ['==', ['get', 'elevation_normalized'], -1], 'N/A',
      ['concat', ['to-string', ['round', ['get', 'elevation']]], 'm'],
    ],
    'text-size': 10,
    'text-offset': [0, 1.5],
    'text-allow-overlap': false,
    'text-optional': true,
  };

  const elevationLabelPaint: SymbolLayerSpecification['paint'] = {
    'text-color': '#1e293b',
    'text-halo-color': '#ffffff',
    'text-halo-width': 1.5,
  };

  return (
    <>
      {/* Pipe edges */}
      <Source id="sewer-edges" type="geojson" data={edgesGeoJSON} promoteId="id">
        <Layer id="sewer-edges-layer" type="line" paint={pipesPaint} layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
      </Source>

      {/* Sewer nodes */}
      <Source id="sewer-nodes" type="geojson" data={nodesGeoJSON} promoteId="id">
        <Layer id="sewer-nodes-layer" type="circle" paint={nodesPaint} />

        {/* Elevation labels — only in elevation mode */}
        {isElevation && (
          <Layer
            id="sewer-elevation-labels"
            type="symbol"
            layout={elevationLabelLayout}
            paint={elevationLabelPaint}
          />
        )}
      </Source>

      {/* Flow direction arrows (gravity-based from RSPH routing) */}
      <FlowArrows edgesGeoJSON={edgesGeoJSON} />
    </>
  );
}
