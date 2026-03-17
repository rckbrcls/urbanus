'use client';

import { Source, Layer } from 'react-map-gl/maplibre';
import type { LineLayerSpecification } from 'maplibre-gl';
import type { EnrichedFeatureCollection } from '@/features/map/types/elevation.types';
import { HIGHWAY_COLORS } from '@/features/map/constants';

interface StreetsLayerProps {
  data: EnrichedFeatureCollection;
}

/**
 * Data-driven line layer that colors streets by highway type.
 * Uses a MapLibre 'match' expression to replicate the old Leaflet HIGHWAY_COLORS logic.
 */
export default function StreetsLayer({ data }: StreetsLayerProps) {
  // Build the match expression: ['match', ['get', 'highway'], 'motorway', '#e11d48', ...]
  const matchExpr: LineLayerSpecification['paint'] = {
    'line-color': [
      'match',
      ['get', 'highway'],
      ...Object.entries(HIGHWAY_COLORS).flatMap(([type, color]) => [type, color]),
      HIGHWAY_COLORS.default, // fallback
    ] as unknown as string,
    'line-width': 2,
    'line-opacity': 0.8,
  };

  return (
    <Source id="streets" type="geojson" data={data}>
      <Layer id="streets-layer" type="line" paint={matchExpr} />
    </Source>
  );
}
