'use client';

import { Source, Layer } from 'react-map-gl/maplibre';
import type { EnrichedFeatureCollection } from '@/features/map/types/elevation.types';
import { EDGES_DEFAULT_PAINT, EDGES_LAYOUT } from '@/lib/map/layers';

interface StreetsLayerProps {
  data: EnrichedFeatureCollection;
}

/**
 * Read-only street preview that shares the default graph-editor edge style.
 */
export default function StreetsLayer({ data }: StreetsLayerProps) {
  return (
    <Source id="streets" type="geojson" data={data}>
      <Layer id="streets-layer" type="line" paint={EDGES_DEFAULT_PAINT} layout={EDGES_LAYOUT} />
    </Source>
  );
}
