'use client';

import { useMemo } from 'react';
import { Source, Layer } from 'react-map-gl/maplibre';
import {
  NODES_PAINT, EDGES_PAINT, EDGES_LAYOUT,
  NODES_ELEVATION_PAINT, EDGES_ELEVATION_PAINT,
  ELEVATION_LABEL_LAYOUT, ELEVATION_LABEL_PAINT,
} from '@/lib/map/layers';

interface GraphLayersProps {
  nodesGeoJSON: GeoJSON.FeatureCollection;
  edgesGeoJSON: GeoJSON.FeatureCollection;
  viewMode?: 'type' | 'elevation';
  elevationRange?: { min: number; max: number } | null;
}

/** Normalize elevation to 0-1 range. Returns -1 for null/missing. */
function normalizeElevation(
  elevation: number | null | undefined,
  min: number,
  range: number,
): number {
  if (elevation == null || isNaN(elevation)) return -1;
  return range === 0 ? 0 : (elevation - min) / range;
}

/**
 * Renders graph nodes (circle) and edges (line) using feature-state
 * for interactive styling (hover, selected, error).
 *
 * Supports elevation view mode with topographic color gradient.
 */
export default function GraphLayers({
  nodesGeoJSON,
  edgesGeoJSON,
  viewMode,
  elevationRange,
}: GraphLayersProps) {
  const isElevation = viewMode === 'elevation' && elevationRange;
  const min = elevationRange?.min ?? 0;
  const range = elevationRange ? elevationRange.max - elevationRange.min || 1 : 1;

  // Inject elevation_normalized into GeoJSON features for the paint expression
  const enrichedNodesGeoJSON = useMemo(() => {
    if (!isElevation) return nodesGeoJSON;
    return {
      ...nodesGeoJSON,
      features: nodesGeoJSON.features.map((f) => ({
        ...f,
        properties: {
          ...f.properties,
          elevation_normalized: normalizeElevation(
            f.properties?.elevation as number | null,
            min,
            range,
          ),
        },
      })),
    };
  }, [nodesGeoJSON, isElevation, min, range]);

  const enrichedEdgesGeoJSON = useMemo(() => {
    if (!isElevation) return edgesGeoJSON;
    // Compute average elevation from slope + length (approximate)
    // We need node elevations — build a lookup from the nodes GeoJSON
    const nodeLookup = new Map<string, number>();
    for (const f of nodesGeoJSON.features) {
      const elev = f.properties?.elevation as number | null;
      if (elev != null && f.id != null) {
        nodeLookup.set(String(f.id), elev);
      }
    }

    return {
      ...edgesGeoJSON,
      features: edgesGeoJSON.features.map((f) => {
        const srcId = f.properties?.sourceId ?? f.properties?.id?.split('->')[0];
        const tgtId = f.properties?.targetId ?? f.properties?.id?.split('->')[1];
        const srcElev = nodeLookup.get(String(srcId));
        const tgtElev = nodeLookup.get(String(tgtId));
        let elevNorm = -1;
        if (srcElev != null && tgtElev != null) {
          elevNorm = normalizeElevation((srcElev + tgtElev) / 2, min, range);
        } else if (srcElev != null) {
          elevNorm = normalizeElevation(srcElev, min, range);
        } else if (tgtElev != null) {
          elevNorm = normalizeElevation(tgtElev, min, range);
        }
        return {
          ...f,
          properties: { ...f.properties, elevation_normalized: elevNorm },
        };
      }),
    };
  }, [edgesGeoJSON, nodesGeoJSON, isElevation, min, range]);

  return (
    <>
      {/* Edges — render below nodes */}
      <Source
        id="graph-edges"
        type="geojson"
        data={isElevation ? enrichedEdgesGeoJSON : edgesGeoJSON}
        promoteId="id"
      >
        <Layer
          id="graph-edges-layer"
          type="line"
          paint={isElevation ? EDGES_ELEVATION_PAINT : EDGES_PAINT}
          layout={EDGES_LAYOUT}
        />
      </Source>

      {/* Nodes */}
      <Source
        id="graph-nodes"
        type="geojson"
        data={isElevation ? enrichedNodesGeoJSON : nodesGeoJSON}
        promoteId="id"
      >
        <Layer
          id="graph-nodes-layer"
          type="circle"
          paint={isElevation ? NODES_ELEVATION_PAINT : NODES_PAINT}
        />
        {isElevation && (
          <Layer
            id="graph-elevation-labels"
            type="symbol"
            layout={ELEVATION_LABEL_LAYOUT}
            paint={ELEVATION_LABEL_PAINT}
          />
        )}
      </Source>
    </>
  );
}
