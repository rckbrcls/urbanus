'use client';

import { Source, Layer } from 'react-map-gl/maplibre';
import { FLOW_ARROWS_LAYOUT, FLOW_ARROWS_PAINT } from '@/lib/map/layers';

interface FlowArrowsProps {
  edgesGeoJSON: GeoJSON.FeatureCollection;
}

/**
 * Symbol layer that renders directional arrows along edges.
 * Uses text-field='▶' placed along the line geometry.
 */
export default function FlowArrows({ edgesGeoJSON }: FlowArrowsProps) {
  return (
    <Source id="flow-arrows" type="geojson" data={edgesGeoJSON}>
      <Layer
        id="flow-arrows-layer"
        type="symbol"
        layout={FLOW_ARROWS_LAYOUT}
        paint={FLOW_ARROWS_PAINT}
      />
    </Source>
  );
}
