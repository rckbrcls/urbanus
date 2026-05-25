'use client';

import { useMemo } from 'react';
import { Source, Layer } from 'react-map-gl/maplibre';
import type { MapNode } from '@/features/map/types/node.types';
import { NODES_PAINT } from '@/lib/map/layers';

interface PreviewNodesLayerProps {
  nodes: MapNode[];
}

/**
 * Read-only circle layer for preview nodes on the home page.
 */
export default function PreviewNodesLayer({ nodes }: PreviewNodesLayerProps) {
  const geojson = useMemo((): GeoJSON.FeatureCollection => ({
    type: 'FeatureCollection',
    features: nodes.map((n) => ({
      type: 'Feature' as const,
      properties: {
        id: n.id,
        elevation: n.elevation,
        degree: n.degree ?? 0,
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [n.position.lng, n.position.lat],
      },
    })),
  }), [nodes]);

  if (nodes.length === 0) return null;

  return (
    <Source id="preview-nodes" type="geojson" data={geojson}>
      <Layer id="preview-nodes-layer" type="circle" paint={NODES_PAINT} />
    </Source>
  );
}
