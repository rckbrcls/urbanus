/**
 * Geometric clipping of LineStrings to a bounding box.
 *
 * Uses an adapted Cohen-Sutherland approach: walk each segment of the
 * LineString, compute intersections with bbox edges, and emit only the
 * portions that lie inside (or on the boundary of) the bbox.
 */

import type { BoundingBox } from "./types";

/** GeoJSON coordinate pair [lng, lat]. */
type Coord = [number, number];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isInside(coord: Coord, bbox: BoundingBox): boolean {
  const [lng, lat] = coord;
  return (
    lat >= bbox.southWest.lat &&
    lat <= bbox.northEast.lat &&
    lng >= bbox.southWest.lng &&
    lng <= bbox.northEast.lng
  );
}

/**
 * Parametric intersection of segment A→B with segment C→D.
 * Returns { t, point } where t ∈ [0,1] is the parameter along AB,
 * or null if no intersection exists within both segments.
 */
function segmentIntersection(
  a: Coord,
  b: Coord,
  c: Coord,
  d: Coord,
): { t: number; point: Coord } | null {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const ex = d[0] - c[0];
  const ey = d[1] - c[1];

  const denom = dx * ey - dy * ex;
  if (Math.abs(denom) < 1e-12) return null; // parallel / collinear

  const t = ((c[0] - a[0]) * ey - (c[1] - a[1]) * ex) / denom;
  const u = ((c[0] - a[0]) * dy - (c[1] - a[1]) * dx) / denom;

  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;

  return {
    t: Math.max(0, Math.min(1, t)),
    point: [a[0] + t * dx, a[1] + t * dy],
  };
}

/** Return the 4 edges of the bbox as segment pairs [start, end]. */
function bboxEdges(bbox: BoundingBox): [Coord, Coord][] {
  const { southWest: sw, northEast: ne } = bbox;
  return [
    // bottom: SW → SE
    [[sw.lng, sw.lat], [ne.lng, sw.lat]],
    // top: NW → NE
    [[sw.lng, ne.lat], [ne.lng, ne.lat]],
    // left: SW → NW
    [[sw.lng, sw.lat], [sw.lng, ne.lat]],
    // right: SE → NE
    [[ne.lng, sw.lat], [ne.lng, ne.lat]],
  ];
}

/**
 * Find all intersection points of segment A→B with the bbox edges.
 * Returns them sorted by parameter t (position along AB).
 */
function findIntersections(
  a: Coord,
  b: Coord,
  bbox: BoundingBox,
): { t: number; point: Coord }[] {
  const edges = bboxEdges(bbox);
  const hits: { t: number; point: Coord }[] = [];

  for (const [c, d] of edges) {
    const hit = segmentIntersection(a, b, c, d);
    if (hit) hits.push(hit);
  }

  // Deduplicate intersections at very close t values (corner hits)
  hits.sort((x, y) => x.t - y.t);
  const deduped: { t: number; point: Coord }[] = [];
  for (const h of hits) {
    if (deduped.length === 0 || h.t - deduped[deduped.length - 1].t > 1e-9) {
      deduped.push(h);
    }
  }
  return deduped;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Clip a LineString (array of [lng, lat] coordinates) to a bounding box.
 *
 * Returns zero or more coordinate arrays, each representing a LineString
 * that lies entirely within (or on the boundary of) the bbox.
 */
export function clipLineStringToBbox(
  coordinates: Coord[],
  bbox: BoundingBox,
): Coord[][] {
  if (coordinates.length < 2) return [];

  const result: Coord[][] = [];
  let current: Coord[] = [];

  // Seed with the first point if inside
  if (isInside(coordinates[0], bbox)) {
    current.push(coordinates[0]);
  }

  for (let i = 0; i < coordinates.length - 1; i++) {
    const a = coordinates[i];
    const b = coordinates[i + 1];
    const aIn = isInside(a, bbox);
    const bIn = isInside(b, bbox);

    if (aIn && bIn) {
      // Both inside — just extend current segment
      current.push(b);
    } else if (aIn && !bIn) {
      // Exiting the bbox — find exit point, close current segment
      const hits = findIntersections(a, b, bbox);
      if (hits.length > 0) {
        current.push(hits[hits.length - 1].point);
      }
      if (current.length >= 2) result.push(current);
      current = [];
    } else if (!aIn && bIn) {
      // Entering the bbox — find entry point, start new segment
      const hits = findIntersections(a, b, bbox);
      if (hits.length > 0) {
        current = [hits[0].point, b];
      } else {
        current = [b];
      }
    } else {
      // Both outside — segment might still cross through the bbox
      const hits = findIntersections(a, b, bbox);
      if (hits.length >= 2) {
        // Enters and exits — create a standalone segment
        if (current.length >= 2) result.push(current);
        current = [];
        result.push([hits[0].point, hits[hits.length - 1].point]);
      }
      // If 0 or 1 hit, segment doesn't meaningfully cross the bbox
    }
  }

  // Flush remaining segment
  if (current.length >= 2) result.push(current);

  return result;
}

/**
 * Clip every LineString feature in a FeatureCollection to a bounding box.
 *
 * - Features entirely outside the bbox are dropped.
 * - Features that cross the boundary are split; each piece preserves the
 *   original properties with a suffixed id (e.g. `123-0`, `123-1`).
 * - Non-LineString features are passed through unchanged.
 */
export function clipFeatureCollectionToBbox(
  fc: GeoJSON.FeatureCollection,
  bbox: BoundingBox,
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];

  for (const feature of fc.features) {
    if (feature.geometry.type !== "LineString") {
      features.push(feature);
      continue;
    }

    const coords = feature.geometry.coordinates as Coord[];
    const clipped = clipLineStringToBbox(coords, bbox);

    if (clipped.length === 0) continue;

    if (clipped.length === 1) {
      features.push({
        ...feature,
        geometry: { type: "LineString", coordinates: clipped[0] },
      });
    } else {
      for (let i = 0; i < clipped.length; i++) {
        features.push({
          ...feature,
          properties: {
            ...feature.properties,
            id: feature.properties?.id != null
              ? `${feature.properties.id}-${i}`
              : undefined,
          },
          geometry: { type: "LineString", coordinates: clipped[i] },
        });
      }
    }
  }

  return { type: "FeatureCollection", features };
}
