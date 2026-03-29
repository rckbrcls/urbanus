'use client';

import { Source, Layer } from 'react-map-gl/maplibre';

interface BboxOverlayProps {
  bounds: {
    southWest: { lat: number; lng: number };
    northEast: { lat: number; lng: number };
  };
}

export default function BboxOverlay({ bounds }: BboxOverlayProps) {
  const { southWest: sw, northEast: ne } = bounds;

  const geojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [sw.lng, sw.lat],
              [ne.lng, sw.lat],
              [ne.lng, ne.lat],
              [sw.lng, ne.lat],
              [sw.lng, sw.lat],
            ],
          ],
        },
      },
    ],
  };

  return (
    <Source id="bbox-overlay" type="geojson" data={geojson}>
      <Layer
        id="bbox-overlay-fill"
        type="fill"
        paint={{
          'fill-color': '#6366f1',
          'fill-opacity': 0.04,
        }}
      />
      <Layer
        id="bbox-overlay-line"
        type="line"
        paint={{
          'line-color': '#6366f1',
          'line-width': 2,
          'line-dasharray': [4, 2],
        }}
      />
    </Source>
  );
}
