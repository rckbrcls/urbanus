/**
 * Snapping utilities for the graph editor.
 *
 * Priority:
 *   1. Existing graph nodes (queryRenderedFeatures — GPU-accelerated)
 *   2. Street geometry (turf.nearestPointOnLine)
 */

import type { MapRef } from 'react-map-gl/maplibre';
import * as turf from '@turf/turf';
import type { SnapResult } from '@/lib/graph/types';

const DEFAULT_SNAP_RADIUS_PX = 12;

/**
 * Attempt to snap a click position to the nearest node or street.
 */
export function snapToNearest(
  lngLat: { lng: number; lat: number },
  mapRef: MapRef | null,
  streetFeatures: GeoJSON.FeatureCollection | null,
  snapRadiusPx: number = DEFAULT_SNAP_RADIUS_PX,
): SnapResult {
  if (!mapRef) {
    return { type: 'none', coordinates: [lngLat.lng, lngLat.lat] };
  }

  const map = mapRef.getMap();
  const point = map.project([lngLat.lng, lngLat.lat]);

  // 1. Query rendered node features in pixel radius
  const nodeFeatures = map.queryRenderedFeatures(
    [
      [point.x - snapRadiusPx, point.y - snapRadiusPx],
      [point.x + snapRadiusPx, point.y + snapRadiusPx],
    ],
    { layers: ['graph-nodes-layer'] },
  );

  if (nodeFeatures.length > 0) {
    const closest = nodeFeatures[0];
    const geom = closest.geometry;
    if (geom.type === 'Point') {
      return {
        type: 'node',
        nodeId: closest.properties?.id as string,
        coordinates: geom.coordinates as [number, number],
      };
    }
  }

  // 2. Snap to street geometry
  if (streetFeatures && streetFeatures.features.length > 0) {
    const clickPoint = turf.point([lngLat.lng, lngLat.lat]);

    // Convert snap radius from pixels to approximate meters at current zoom
    const zoomLevel = map.getZoom();
    const metersPerPixel =
      (40075016.686 * Math.cos((lngLat.lat * Math.PI) / 180)) /
      Math.pow(2, zoomLevel + 8);
    const snapRadiusMeters = snapRadiusPx * metersPerPixel;

    let bestDist = Infinity;
    let bestCoord: [number, number] | null = null;

    for (const feature of streetFeatures.features) {
      if (feature.geometry.type !== 'LineString') continue;

      const line = turf.lineString(feature.geometry.coordinates);
      const snapped = turf.nearestPointOnLine(line, clickPoint);
      const dist = snapped.properties.dist ?? Infinity; // km

      if (dist * 1000 < snapRadiusMeters && dist < bestDist) {
        bestDist = dist;
        bestCoord = snapped.geometry.coordinates as [number, number];
      }
    }

    if (bestCoord) {
      return { type: 'street', coordinates: bestCoord };
    }
  }

  return { type: 'none', coordinates: [lngLat.lng, lngLat.lat] };
}
