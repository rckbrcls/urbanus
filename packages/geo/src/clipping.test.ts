import { describe, it, expect } from "vitest";
import { clipLineStringToBbox, clipFeatureCollectionToBbox } from "./clipping";
import type { BoundingBox } from "./types";

// Bbox: lat [0, 10], lng [0, 10]
const bbox: BoundingBox = {
  southWest: { lat: 0, lng: 0 },
  northEast: { lat: 10, lng: 10 },
};

// Helper: coords are [lng, lat]
const coord = (lng: number, lat: number): [number, number] => [lng, lat];

describe("clipLineStringToBbox", () => {
  it("returns unchanged when fully inside", () => {
    const coords = [coord(2, 2), coord(5, 5), coord(8, 8)];
    const result = clipLineStringToBbox(coords, bbox);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(coords);
  });

  it("returns empty when fully outside", () => {
    const coords = [coord(12, 12), coord(15, 15)];
    const result = clipLineStringToBbox(coords, bbox);
    expect(result).toHaveLength(0);
  });

  it("clips a line entering the bbox from outside", () => {
    // Enters from the left (lng goes from -5 to 5, lat stays at 5)
    const coords = [coord(-5, 5), coord(5, 5)];
    const result = clipLineStringToBbox(coords, bbox);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(2);
    // Entry point should be at lng=0, lat=5
    expect(result[0][0][0]).toBeCloseTo(0, 5);
    expect(result[0][0][1]).toBeCloseTo(5, 5);
    // End point should be the original
    expect(result[0][1]).toEqual(coord(5, 5));
  });

  it("clips a line exiting the bbox", () => {
    // Starts inside, exits to the right
    const coords = [coord(5, 5), coord(15, 5)];
    const result = clipLineStringToBbox(coords, bbox);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(2);
    expect(result[0][0]).toEqual(coord(5, 5));
    // Exit point at lng=10, lat=5
    expect(result[0][1][0]).toBeCloseTo(10, 5);
    expect(result[0][1][1]).toBeCloseTo(5, 5);
  });

  it("clips a line crossing two edges (enter and exit)", () => {
    // Crosses bbox horizontally: enters left, exits right
    const coords = [coord(-5, 5), coord(15, 5)];
    const result = clipLineStringToBbox(coords, bbox);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(2);
    expect(result[0][0][0]).toBeCloseTo(0, 5); // entry at left edge
    expect(result[0][1][0]).toBeCloseTo(10, 5); // exit at right edge
  });

  it("produces two segments when line enters, exits, and re-enters", () => {
    // Goes: inside → outside → inside
    const coords = [
      coord(2, 5),  // inside
      coord(12, 5), // outside (exits right)
      coord(12, 8), // outside
      coord(2, 8),  // inside (enters from right? no, from outside at top-right... let me reconsider)
    ];
    // Actually: segment 0→1 exits. segment 1→2 both outside. segment 2→3 enters.
    const result = clipLineStringToBbox(coords, bbox);
    expect(result).toHaveLength(2);
    // First segment: from (2,5) to exit point at (10,5)
    expect(result[0][0]).toEqual(coord(2, 5));
    expect(result[0][1][0]).toBeCloseTo(10, 5);
    // Second segment: from entry point at (10,8) to (2,8)
    expect(result[1][0][0]).toBeCloseTo(10, 5);
    expect(result[1][1]).toEqual(coord(2, 8));
  });

  it("treats vertices exactly on the boundary as inside", () => {
    const coords = [coord(0, 0), coord(10, 10)];
    const result = clipLineStringToBbox(coords, bbox);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(coords);
  });

  it("includes a segment running along a bbox edge", () => {
    // Runs along the bottom edge
    const coords = [coord(2, 0), coord(8, 0)];
    const result = clipLineStringToBbox(coords, bbox);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(coords);
  });

  it("handles a segment that crosses diagonally through the bbox (both endpoints outside)", () => {
    // Diagonal from bottom-left outside to top-right outside, passing through bbox
    const coords = [coord(-5, -5), coord(15, 15)];
    const result = clipLineStringToBbox(coords, bbox);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(2);
    // Entry near (0,0), exit near (10,10)
    expect(result[0][0][0]).toBeCloseTo(0, 1);
    expect(result[0][0][1]).toBeCloseTo(0, 1);
    expect(result[0][1][0]).toBeCloseTo(10, 1);
    expect(result[0][1][1]).toBeCloseTo(10, 1);
  });

  it("handles a single-point input gracefully", () => {
    const result = clipLineStringToBbox([coord(5, 5)], bbox);
    expect(result).toHaveLength(0);
  });

  it("handles empty input", () => {
    const result = clipLineStringToBbox([], bbox);
    expect(result).toHaveLength(0);
  });

  it("clips a multi-vertex line with mixed inside/outside vertices", () => {
    const coords = [
      coord(5, -2),  // outside (below)
      coord(5, 3),   // inside
      coord(5, 7),   // inside
      coord(5, 12),  // outside (above)
    ];
    const result = clipLineStringToBbox(coords, bbox);
    expect(result).toHaveLength(1);
    // Entry at (5, 0), then (5, 3), (5, 7), exit at (5, 10)
    expect(result[0]).toHaveLength(4);
    expect(result[0][0][1]).toBeCloseTo(0, 5); // entry at south edge
    expect(result[0][1]).toEqual(coord(5, 3));
    expect(result[0][2]).toEqual(coord(5, 7));
    expect(result[0][3][1]).toBeCloseTo(10, 5); // exit at north edge
  });
});

describe("clipFeatureCollectionToBbox", () => {
  const makeLineFeature = (
    id: number,
    coords: [number, number][],
  ): GeoJSON.Feature => ({
    type: "Feature",
    properties: { id, highway: "residential", name: "Test Street" },
    geometry: { type: "LineString", coordinates: coords },
  });

  it("keeps a feature fully inside unchanged", () => {
    const fc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [makeLineFeature(1, [coord(2, 2), coord(8, 8)])],
    };
    const result = clipFeatureCollectionToBbox(fc, bbox);
    expect(result.features).toHaveLength(1);
    expect(result.features[0].properties?.id).toBe(1);
  });

  it("drops a feature fully outside", () => {
    const fc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [makeLineFeature(1, [coord(20, 20), coord(25, 25)])],
    };
    const result = clipFeatureCollectionToBbox(fc, bbox);
    expect(result.features).toHaveLength(0);
  });

  it("clips and preserves properties", () => {
    const fc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [makeLineFeature(42, [coord(-5, 5), coord(5, 5)])],
    };
    const result = clipFeatureCollectionToBbox(fc, bbox);
    expect(result.features).toHaveLength(1);
    expect(result.features[0].properties?.id).toBe(42);
    expect(result.features[0].properties?.highway).toBe("residential");
  });

  it("splits a feature that enters, exits, and re-enters into multiple features with suffixed ids", () => {
    const fc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [
        makeLineFeature(7, [
          coord(5, 5),   // inside
          coord(15, 5),  // outside
          coord(15, 8),  // outside
          coord(5, 8),   // inside
        ]),
      ],
    };
    const result = clipFeatureCollectionToBbox(fc, bbox);
    expect(result.features.length).toBe(2);
    expect(result.features[0].properties?.id).toBe("7-0");
    expect(result.features[1].properties?.id).toBe("7-1");
    // Both should preserve other properties
    expect(result.features[0].properties?.highway).toBe("residential");
    expect(result.features[1].properties?.highway).toBe("residential");
  });

  it("passes through non-LineString features unchanged", () => {
    const pointFeature: GeoJSON.Feature = {
      type: "Feature",
      properties: { id: 99 },
      geometry: { type: "Point", coordinates: [50, 50] },
    };
    const fc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [pointFeature],
    };
    const result = clipFeatureCollectionToBbox(fc, bbox);
    expect(result.features).toHaveLength(1);
    expect(result.features[0]).toEqual(pointFeature);
  });
});
