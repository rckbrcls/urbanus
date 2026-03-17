'use client';

import { Source, Layer } from 'react-map-gl/maplibre';
import { NODES_PAINT, EDGES_PAINT, EDGES_LAYOUT } from '@/lib/map/layers';

interface GraphLayersProps {
  nodesGeoJSON: GeoJSON.FeatureCollection;
  edgesGeoJSON: GeoJSON.FeatureCollection;
}

/**
 * Renders graph nodes (circle) and edges (line) using feature-state
 * for interactive styling (hover, selected, error).
 *
 * promoteId="id" is set on the Sources so that map.setFeatureState()
 * can target individual features by their `id` property.
 */
export default function GraphLayers({ nodesGeoJSON, edgesGeoJSON }: GraphLayersProps) {
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
          paint={EDGES_PAINT}
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
          paint={NODES_PAINT}
        />
      </Source>
    </>
  );
}
