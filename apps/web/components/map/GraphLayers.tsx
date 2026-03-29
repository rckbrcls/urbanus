'use client';

import { useMemo } from 'react';
import { Source, Layer } from 'react-map-gl/maplibre';
import { NODES_PAINT, EDGES_PAINT, EDGES_LAYOUT } from '@/lib/map/layers';

interface GraphLayersProps {
  nodesGeoJSON: GeoJSON.FeatureCollection;
  edgesGeoJSON: GeoJSON.FeatureCollection;
  /** When true, reduce opacity so sewer overlay takes visual precedence */
  dimmed?: boolean;
}

/**
 * Renders graph nodes (circle) and edges (line) using feature-state
 * for interactive styling (hover, selected, error).
 *
 * promoteId="id" is set on the Sources so that map.setFeatureState()
 * can target individual features by their `id` property.
 */
export default function GraphLayers({ nodesGeoJSON, edgesGeoJSON, dimmed = false }: GraphLayersProps) {
  const edgesPaint = useMemo(
    () => dimmed ? { ...EDGES_PAINT, 'line-opacity': 0.25 } : EDGES_PAINT,
    [dimmed],
  );

  const nodesPaint = useMemo(
    () => dimmed ? { ...NODES_PAINT, 'circle-opacity': 0.3 as unknown as number } : NODES_PAINT,
    [dimmed],
  );

  return (
    <>
      {/* Edges — render below nodes */}
      <Source
        id="graph-edges"
        type="geojson"
        data={edgesGeoJSON}
        promoteId="id"
      >
        <Layer
          id="graph-edges-layer"
          type="line"
          paint={edgesPaint}
          layout={EDGES_LAYOUT}
        />
      </Source>

      {/* Nodes */}
      <Source
        id="graph-nodes"
        type="geojson"
        data={nodesGeoJSON}
        promoteId="id"
      >
        <Layer
          id="graph-nodes-layer"
          type="circle"
          paint={nodesPaint}
        />
      </Source>
    </>
  );
}
