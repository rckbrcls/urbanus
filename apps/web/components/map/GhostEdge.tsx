'use client';

import { Source, Layer } from 'react-map-gl/maplibre';
import { GHOST_EDGE_PAINT } from '@/lib/map/layers';

interface GhostEdgeProps {
  /** [lng, lat] of the source node */
  from: [number, number];
  /** [lng, lat] of the current cursor position */
  to: [number, number];
}

/**
 * Dashed line preview shown during add-edge mode, following the cursor
 * from the selected source node to the current mouse position.
 */
export default function GhostEdge({ from, to }: GhostEdgeProps) {
  const geojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: [from, to],
        },
      },
    ],
  };

  return (
    <Source id="ghost-edge" type="geojson" data={geojson}>
      <Layer id="ghost-edge-layer" type="line" paint={GHOST_EDGE_PAINT} />
    </Source>
  );
}
