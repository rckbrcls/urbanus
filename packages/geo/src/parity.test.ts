/**
 * Cross-validation: Python ↔ TypeScript parity tests.
 *
 * These exact input/output pairs are mirrored in:
 *   py/urbanus-geo/tests/test_parity_values.py
 *
 * Both files MUST produce the same results within 0.5% tolerance.
 */
import { describe, it, expect } from "vitest";
import { GeoCalculations } from "./calculations";

describe("Python ↔ TypeScript Parity", () => {
  describe("haversine / calculateDistance", () => {
    it("SP → RJ: 358-362 km", () => {
      const dist = GeoCalculations.calculateDistance(
        { lat: -23.55, lng: -46.63 },
        { lat: -22.91, lng: -43.17 }
      );
      expect(dist).toBeGreaterThan(358_000);
      expect(dist).toBeLessThan(362_000);
    });

    it("same point → 0", () => {
      const dist = GeoCalculations.calculateDistance(
        { lat: -23.55, lng: -46.63 },
        { lat: -23.55, lng: -46.63 }
      );
      expect(dist).toBe(0);
    });

    it("1° at equator: 111,190-111,200 m", () => {
      const dist = GeoCalculations.calculateDistance({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
      expect(dist).toBeGreaterThan(111_190);
      expect(dist).toBeLessThan(111_200);
    });
  });

  describe("area_km2 / calculateArea", () => {
    it("1°×1° equator: 12,300-12,500 km²", () => {
      const area = GeoCalculations.calculateArea({
        southWest: { lat: 0, lng: 0 },
        northEast: { lat: 1, lng: 1 },
      });
      expect(area).toBeGreaterThan(12_300);
      expect(area).toBeLessThan(12_500);
    });
  });

  describe("slope_2d / slope2d", () => {
    it("110,100,100 → 0.10", () => {
      expect(GeoCalculations.slope2d(110, 100, 100)).toBeCloseTo(0.1);
    });
  });

  describe("tube_elevation / tubeElevation", () => {
    it("100, 0.90, 0.15 → 98.95", () => {
      expect(GeoCalculations.tubeElevation(100, 0.90, 0.15)).toBeCloseTo(98.95);
    });
  });

  describe("angle_at_node / angleAtNode", () => {
    it("right angle → 90°", () => {
      const angle = GeoCalculations.angleAtNode(
        { lat: 0, lng: 0 },
        { lat: 1, lng: 0 },
        { lat: 1, lng: 1 }
      );
      expect(angle).toBeCloseTo(90.0);
    });

    it("straight line → 180°", () => {
      const angle = GeoCalculations.angleAtNode(
        { lat: 0, lng: 0 },
        { lat: 1, lng: 0 },
        { lat: 2, lng: 0 }
      );
      expect(angle).toBeCloseTo(180.0);
    });
  });
});
