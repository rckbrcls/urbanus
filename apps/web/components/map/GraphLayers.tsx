'use client';

import { useMemo } from 'react';
import { Source, Layer } from 'react-map-gl/maplibre';
import { GeoCalculations } from '@urbanus/geo';
import {
  NODES_PAINT, EDGES_DEFAULT_PAINT, EDGES_STREETS_PAINT, EDGES_LAYOUT,
  NODES_ELEVATION_PAINT, EDGES_ELEVATION_PAINT,
  ELEVATION_LABEL_LAYOUT, ELEVATION_LABEL_PAINT,
  EDGE_LENGTH_LABEL_LAYOUT, EDGE_LENGTH_LABEL_PAINT,
  formatEdgeLengthLabel, getElevationColor, getElevationLabel,
} from '@/lib/map/layers';
import type { SewerViewMode } from '@/components/map/SewerNetworkLayers';
import {
  getRenderedNodeCategory,
  isRenderedNodeCategoryVisible,
  type VisibleRenderedNodeCategories,
} from '@/lib/sewer/renderLegend';

interface GraphLayersProps {
  nodesGeoJSON: GeoJSON.FeatureCollection;
  edgesGeoJSON: GeoJSON.FeatureCollection;
  viewMode?: SewerViewMode;
  elevationRange?: { min: number; max: number } | null;
  visibleNodeCategories?: VisibleRenderedNodeCategories;
  showEdgeLengthLabels?: boolean;
  showNodeElevationLabels?: boolean;
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

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function calculateLineStringLengthMeters(geometry: GeoJSON.Geometry | null | undefined): number | null {
  if (!geometry || geometry.type !== 'LineString') {
    return null;
  }

  const coordinates = geometry.coordinates as number[][];
  if (coordinates.length < 2) {
    return null;
  }

  let totalLength = 0;

  for (let index = 1; index < coordinates.length; index += 1) {
    const previous = coordinates[index - 1];
    const current = coordinates[index];

    if (
      !Array.isArray(previous) ||
      !Array.isArray(current) ||
      previous.length < 2 ||
      current.length < 2
    ) {
      continue;
    }

    totalLength += GeoCalculations.calculateDistance(
      { lat: previous[1], lng: previous[0] },
      { lat: current[1], lng: current[0] },
    );
  }

  return Number.isFinite(totalLength) && totalLength > 0 ? totalLength : null;
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
  visibleNodeCategories,
  showEdgeLengthLabels = false,
  showNodeElevationLabels = false,
}: GraphLayersProps) {
  const hasElevationRange = Boolean(elevationRange);
  const isElevation = viewMode === 'elevation' && hasElevationRange;
  const shouldEnrichElevation = isElevation || (showNodeElevationLabels && hasElevationRange);
  const edgesPaint = isElevation ? EDGES_ELEVATION_PAINT
    : viewMode === 'streets' ? EDGES_STREETS_PAINT
    : EDGES_DEFAULT_PAINT;
  const min = elevationRange?.min ?? 0;
  const range = elevationRange ? elevationRange.max - elevationRange.min || 1 : 1;

  const filteredNodesGeoJSON = useMemo(() => {
    if (!visibleNodeCategories) {
      return nodesGeoJSON;
    }

    return {
      ...nodesGeoJSON,
      features: nodesGeoJSON.features.filter((feature) =>
        isRenderedNodeCategoryVisible(
          getRenderedNodeCategory((feature.properties ?? {}) as Parameters<typeof getRenderedNodeCategory>[0]),
          visibleNodeCategories,
        )),
    };
  }, [nodesGeoJSON, visibleNodeCategories]);

  // Precompute elevation-derived properties to keep MapLibre layers on simple `get` expressions.
  const enrichedNodesGeoJSON = useMemo(() => {
    if (!shouldEnrichElevation) return filteredNodesGeoJSON;
    return {
      ...filteredNodesGeoJSON,
      features: filteredNodesGeoJSON.features.map((f) => {
        const elevation = f.properties?.elevation as number | null;
        const elevationNormalized = normalizeElevation(elevation, min, range);

        return {
          ...f,
          properties: {
            ...f.properties,
            elevation_normalized: elevationNormalized,
            elevationColor: getElevationColor(elevationNormalized),
            elevationLabel: getElevationLabel(elevation),
          },
        };
      }),
    };
  }, [filteredNodesGeoJSON, min, range, shouldEnrichElevation]);

  const enrichedEdgesGeoJSON = useMemo(() => {
    const edgesWithLengths = edgesGeoJSON.features.map((feature) => {
      const lengthFromGeometry = calculateLineStringLengthMeters(feature.geometry);
      const fallbackLength = toNumber(feature.properties?.length);
      const lengthMeters = lengthFromGeometry ?? fallbackLength;

      return {
        ...feature,
        properties: {
          ...feature.properties,
          lengthMeters,
          lengthLabel: formatEdgeLengthLabel(lengthMeters),
        },
      };
    });

    if (!isElevation) {
      return {
        ...edgesGeoJSON,
        features: edgesWithLengths,
      };
    }

    // Compute average elevation for color mapping using node elevations.
    const nodeLookup = new Map<string, number>();
    for (const f of nodesGeoJSON.features) {
      const elev = f.properties?.elevation as number | null;
      if (elev != null && f.id != null) {
        nodeLookup.set(String(f.id), elev);
      }
    }

    return {
      ...edgesGeoJSON,
      features: edgesWithLengths.map((f) => {
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
          properties: {
            ...f.properties,
            elevation_normalized: elevNorm,
            elevationColor: getElevationColor(elevNorm),
          },
        };
      }),
    };
  }, [edgesGeoJSON, isElevation, min, nodesGeoJSON, range]);

  return (
    <>
      {/* Edges — render below nodes */}
      <Source
        id="graph-edges"
        type="geojson"
        data={enrichedEdgesGeoJSON}
        promoteId="id"
      >
        <Layer
          id="graph-edges-layer"
          type="line"
          paint={edgesPaint}
          layout={EDGES_LAYOUT}
        />
        {showEdgeLengthLabels && (
          <Layer
            id="graph-edge-length-labels"
            type="symbol"
            layout={EDGE_LENGTH_LABEL_LAYOUT}
            paint={EDGE_LENGTH_LABEL_PAINT}
          />
        )}
      </Source>

      {/* Nodes */}
      <Source
        id="graph-nodes"
        type="geojson"
        data={shouldEnrichElevation ? enrichedNodesGeoJSON : filteredNodesGeoJSON}
        promoteId="id"
      >
        <Layer
          id="graph-nodes-layer"
          type="circle"
          paint={isElevation ? NODES_ELEVATION_PAINT : NODES_PAINT}
        />
        {showNodeElevationLabels && hasElevationRange && (
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
