import { describe, it, expect } from "vitest";
import { GeoCalculations } from "./calculations";
import type { BoundingBox, LatLng } from "./types";

const bbox = (s: number, w: number, n: number, e: number): BoundingBox => ({
  southWest: { lat: s, lng: w },
  northEast: { lat: n, lng: e },
});

const pt = (lat: number, lng: number): LatLng => ({ lat, lng });

describe("GeoCalculations", () => {
  describe("calculateArea", () => {
    it("1°×1° at equator ≈ 12,392 km²", () => {
      const area = GeoCalculations.calculateArea(bbox(0, 0, 1, 1));
      expect(area).toBeGreaterThan(12_000);
      expect(area).toBeLessThan(13_000);
    });

    it("zero-size box → 0", () => {
      expect(GeoCalculations.calculateArea(bbox(0, 0, 0, 0))).toBe(0);
    });

    it("higher latitude → smaller area", () => {
      const equator = GeoCalculations.calculateArea(bbox(0, 0, 1, 1));
      const lat60 = GeoCalculations.calculateArea(bbox(60, 0, 61, 1));
      expect(lat60).toBeLessThan(equator);
    });

    it("southern hemisphere works", () => {
      const area = GeoCalculations.calculateArea(bbox(-23.56, -46.64, -23.55, -46.63));
      expect(area).toBeGreaterThan(0);
    });
  });

  describe("calculateDistance", () => {
    it("same point → 0", () => {
      expect(GeoCalculations.calculateDistance(pt(-23.55, -46.63), pt(-23.55, -46.63))).toBe(0);
    });

    it("SP → RJ ≈ 360 km", () => {
      const dist = GeoCalculations.calculateDistance(pt(-23.55, -46.63), pt(-22.91, -43.17));
      expect(dist).toBeGreaterThan(350_000);
      expect(dist).toBeLessThan(370_000);
    });

    it("1° at equator ≈ 111 km", () => {
      const dist = GeoCalculations.calculateDistance(pt(0, 0), pt(1, 0));
      expect(dist).toBeGreaterThan(111_000);
      expect(dist).toBeLessThan(112_000);
    });

    it("symmetry: d(A,B) == d(B,A)", () => {
      const d1 = GeoCalculations.calculateDistance(pt(0, 0), pt(1, 1));
      const d2 = GeoCalculations.calculateDistance(pt(1, 1), pt(0, 0));
      expect(d1).toBeCloseTo(d2, 5);
    });
  });

  describe("getCenter", () => {
    it("symmetric box → midpoint", () => {
      const center = GeoCalculations.getCenter(bbox(-10, -20, 10, 20));
      expect(center.lat).toBeCloseTo(0);
      expect(center.lng).toBeCloseTo(0);
    });
  });

  describe("getDimensions", () => {
    it("1° lat ≈ 111.32 km height", () => {
      const dims = GeoCalculations.getDimensions(bbox(0, 0, 1, 1));
      expect(dims.heightKm).toBeCloseTo(111.32, 0);
    });
  });

  describe("createBboxFromPoints", () => {
    it("normalizes min/max", () => {
      const result = GeoCalculations.createBboxFromPoints(pt(10, 20), pt(5, 15));
      expect(result.southWest.lat).toBe(5);
      expect(result.southWest.lng).toBe(15);
      expect(result.northEast.lat).toBe(10);
      expect(result.northEast.lng).toBe(20);
    });

    it("handles already-ordered inputs", () => {
      const result = GeoCalculations.createBboxFromPoints(pt(5, 15), pt(10, 20));
      expect(result.southWest.lat).toBe(5);
      expect(result.northEast.lat).toBe(10);
    });
  });

  describe("adjustBboxByMargin", () => {
    it("1 km margin ≈ 0.009° lat", () => {
      const original = bbox(0, 0, 1, 1);
      const expanded = GeoCalculations.adjustBboxByMargin(original, 1);
      const marginLat = 1 / 111.32;
      expect(expanded.southWest.lat).toBeCloseTo(-marginLat, 3);
      expect(expanded.northEast.lat).toBeCloseTo(1 + marginLat, 3);
    });

    it("zero margin → same bbox", () => {
      const original = bbox(0, 0, 1, 1);
      const expanded = GeoCalculations.adjustBboxByMargin(original, 0);
      expect(expanded.southWest.lat).toBeCloseTo(0);
      expect(expanded.northEast.lat).toBeCloseTo(1);
    });
  });

  describe("isInsideBbox", () => {
    const b = bbox(-10, -20, 10, 20);

    it("center point → true", () => {
      expect(GeoCalculations.isInsideBbox(pt(0, 0), b)).toBe(true);
    });

    it("outside → false", () => {
      expect(GeoCalculations.isInsideBbox(pt(15, 0), b)).toBe(false);
    });

    it("border → true", () => {
      expect(GeoCalculations.isInsideBbox(pt(10, 20), b)).toBe(true);
    });
  });

  describe("bboxToOverpass", () => {
    it("south,west,north,east format", () => {
      const result = GeoCalculations.bboxToOverpass(bbox(-23.56, -46.64, -23.55, -46.63));
      expect(result).toBe("-23.56,-46.64,-23.55,-46.63");
    });
  });

  describe("slope2d", () => {
    it("10m/100m = 0.10", () => {
      expect(GeoCalculations.slope2d(110, 100, 100)).toBeCloseTo(0.1);
    });

    it("flat = 0", () => {
      expect(GeoCalculations.slope2d(100, 100, 50)).toBe(0);
    });

    it("zero distance → 0", () => {
      expect(GeoCalculations.slope2d(110, 100, 0)).toBe(0);
    });
  });

  describe("tubeElevation", () => {
    it("100 - 0.90 - 0.15 = 98.95", () => {
      expect(GeoCalculations.tubeElevation(100, 0.90, 0.15)).toBeCloseTo(98.95);
    });
  });

  describe("angleAtNode", () => {
    it("straight line → 180°", () => {
      expect(GeoCalculations.angleAtNode(pt(0, 0), pt(1, 0), pt(2, 0))).toBeCloseTo(180);
    });

    it("right angle → 90°", () => {
      expect(GeoCalculations.angleAtNode(pt(0, 0), pt(1, 0), pt(1, 1))).toBeCloseTo(90);
    });

    it("zero vector → 0", () => {
      expect(GeoCalculations.angleAtNode(pt(1, 1), pt(1, 1), pt(2, 2))).toBe(0);
    });
  });
});
