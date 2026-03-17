'use client';

import { useMemo } from 'react';
import { Source, Layer } from 'react-map-gl/maplibre';
import type { CircleLayerSpecification } from 'maplibre-gl';
import type { MapNode } from '@/features/map/types/node.types';

interface PreviewNodesLayerProps {
  nodes: MapNode[];
}

/**
 * Read-only circle layer for preview nodes on the home page.
 * Colors by classification: highest (red), lowest (cyan), endpoint (amber), intersection (violet).
 */
export default function PreviewNodesLayer({ nodes }: PreviewNodesLayerProps) {
  const geojson = useMemo((): GeoJSON.FeatureCollection => ({
    type: 'FeatureCollection',
    features: nodes.map((n) => ({
      type: 'Feature' as const,
      properties: {
        id: n.id,
        classification: n.isHighestElevation
          ? 'highest'
          : n.isLowestElevation
            ? 'lowest'
            : n.isEndpoint
              ? 'endpoint'
              : 'intersection',
        elevation: n.elevation,
        degree: n.degree ?? 0,
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [n.position.lng, n.position.lat],
      },
    })),
  }), [nodes]);

  const paintStyle: CircleLayerSpecification['paint'] = {
    'circle-radius': [
      'match',
      ['get', 'classification'],
      'highest', 6,
      'lowest', 6,
      'endpoint', 5,
      4, // default — intersection
    ] as unknown as number,
    'circle-color': [
      'match',
      ['get', 'classification'],
      'highest', '#ef4444',
      'lowest', '#06b6d4',
      'endpoint', '#f59e0b',
      '#8b5cf6', // default — intersection/violet
    ] as unknown as string,
    'circle-opacity': 0.7,
    'circle-stroke-width': 1,
    'circle-stroke-color': [
      'match',
      ['get', 'classification'],
      'highest', '#ef4444',
      'lowest', '#06b6d4',
      'endpoint', '#f59e0b',
      '#8b5cf6',
    ] as unknown as string,
  };

  if (nodes.length === 0) return null;

  return (
    <Source id="preview-nodes" type="geojson" data={geojson}>
      <Layer id="preview-nodes-layer" type="circle" paint={paintStyle} />
    </Source>
  );
}
