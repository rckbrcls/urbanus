import { describe, it, expect } from "vitest";
import { GeoValidations } from "./validations";

describe("GeoValidations", () => {
  describe("isValidCoordinate", () => {
    it("finite number → true", () => {
      expect(GeoValidations.isValidCoordinate(42.5)).toBe(true);
    });

    it("NaN → false", () => {
      expect(GeoValidations.isValidCoordinate(NaN)).toBe(false);
    });

    it("Infinity → false", () => {
      expect(GeoValidations.isValidCoordinate(Infinity)).toBe(false);
    });

    it("string → false", () => {
      expect(GeoValidations.isValidCoordinate("42")).toBe(false);
    });

    it("zero → true", () => {
      expect(GeoValidations.isValidCoordinate(0)).toBe(true);
    });
  });

  describe("isValidLatitude", () => {
    it("0 → true", () => expect(GeoValidations.isValidLatitude(0)).toBe(true));
    it("90 → true", () => expect(GeoValidations.isValidLatitude(90)).toBe(true));
    it("-90 → true", () => expect(GeoValidations.isValidLatitude(-90)).toBe(true));
    it("91 → false", () => expect(GeoValidations.isValidLatitude(91)).toBe(false));
    it("-91 → false", () => expect(GeoValidations.isValidLatitude(-91)).toBe(false));
  });

  describe("isValidLongitude", () => {
    it("0 → true", () => expect(GeoValidations.isValidLongitude(0)).toBe(true));
    it("180 → true", () => expect(GeoValidations.isValidLongitude(180)).toBe(true));
    it("-180 → true", () => expect(GeoValidations.isValidLongitude(-180)).toBe(true));
    it("181 → false", () => expect(GeoValidations.isValidLongitude(181)).toBe(false));
  });

  describe("isValidLatLng", () => {
    it("valid object → true", () => {
      expect(GeoValidations.isValidLatLng({ lat: -23.55, lng: -46.63 })).toBe(true);
    });

    it("null → false", () => {
      expect(GeoValidations.isValidLatLng(null)).toBe(false);
    });

    it("missing lat → false", () => {
      expect(GeoValidations.isValidLatLng({ lng: -46.63 })).toBe(false);
    });

    it("out of range lat → false", () => {
      expect(GeoValidations.isValidLatLng({ lat: 100, lng: 0 })).toBe(false);
    });
  });

  describe("isValidBbox", () => {
    it("valid bbox → true", () => {
      expect(
        GeoValidations.isValidBbox({
          southWest: { lat: -23.56, lng: -46.64 },
          northEast: { lat: -23.55, lng: -46.63 },
        })
      ).toBe(true);
    });

    it("null → false", () => {
      expect(GeoValidations.isValidBbox(null)).toBe(false);
    });

    it("missing northEast → false", () => {
      expect(GeoValidations.isValidBbox({ southWest: { lat: 0, lng: 0 } })).toBe(false);
    });
  });

  describe("clampLatitude", () => {
    it("100 → 90", () => expect(GeoValidations.clampLatitude(100)).toBe(90));
    it("-200 → -90", () => expect(GeoValidations.clampLatitude(-200)).toBe(-90));
    it("45 → 45", () => expect(GeoValidations.clampLatitude(45)).toBe(45));
  });

  describe("clampLongitude", () => {
    it("200 → 180", () => expect(GeoValidations.clampLongitude(200)).toBe(180));
    it("-200 → -180", () => expect(GeoValidations.clampLongitude(-200)).toBe(-180));
    it("45 → 45", () => expect(GeoValidations.clampLongitude(45)).toBe(45));
  });

  describe("isValidGeoJSON", () => {
    it("valid FeatureCollection → true", () => {
      expect(
        GeoValidations.isValidGeoJSON({
          type: "FeatureCollection",
          features: [],
        })
      ).toBe(true);
    });

    it("empty object → false", () => {
      expect(GeoValidations.isValidGeoJSON({})).toBe(false);
    });

    it("null → false", () => {
      expect(GeoValidations.isValidGeoJSON(null)).toBe(false);
    });
  });

  describe("sanitizeGeoJSON", () => {
    it("filters null geometry", () => {
      const data = {
        type: "FeatureCollection" as const,
        features: [
          { type: "Feature" as const, geometry: null as any, properties: {} },
          {
            type: "Feature" as const,
            geometry: {
              type: "LineString" as const,
              coordinates: [
                [-46.63, -23.55],
                [-46.64, -23.56],
              ],
            },
            properties: {},
          },
        ],
      };
      const result = GeoValidations.sanitizeGeoJSON(data);
      expect(result.features).toHaveLength(1);
    });

    it("filters LineString with < 2 coords", () => {
      const data = {
        type: "FeatureCollection" as const,
        features: [
          {
            type: "Feature" as const,
            geometry: { type: "LineString" as const, coordinates: [[-46.63, -23.55]] },
            properties: {},
          },
        ],
      };
      const result = GeoValidations.sanitizeGeoJSON(data);
      expect(result.features).toHaveLength(0);
    });

    it("preserves valid features", () => {
      const feature = {
        type: "Feature" as const,
        geometry: {
          type: "LineString" as const,
          coordinates: [
            [-46.63, -23.55],
            [-46.64, -23.56],
          ],
        },
        properties: {},
      };
      const data = { type: "FeatureCollection" as const, features: [feature] };
      const result = GeoValidations.sanitizeGeoJSON(data);
      expect(result.features).toHaveLength(1);
    });
  });

  describe("validateBboxFormat", () => {
    it("valid bbox → valid", () => {
      const result = GeoValidations.validateBboxFormat({
        southWest: { lat: -23.56, lng: -46.64 },
        northEast: { lat: -23.55, lng: -46.63 },
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("null → invalid", () => {
      const result = GeoValidations.validateBboxFormat(null);
      expect(result.valid).toBe(false);
    });

    it("missing southWest → INVALID_SOUTHWEST", () => {
      const result = GeoValidations.validateBboxFormat({
        northEast: { lat: 0, lng: 0 },
      });
      expect(result.errors.some((e) => e.code === "INVALID_SOUTHWEST")).toBe(true);
    });
  });

  describe("validateBboxCoordinates", () => {
    it("valid → valid", () => {
      const result = GeoValidations.validateBboxCoordinates({
        southWest: { lat: -23.56, lng: -46.64 },
        northEast: { lat: -23.55, lng: -46.63 },
      });
      expect(result.valid).toBe(true);
    });

    it("south > north → INVALID_LAT_ORDER", () => {
      const result = GeoValidations.validateBboxCoordinates({
        southWest: { lat: 10, lng: 0 },
        northEast: { lat: 5, lng: 1 },
      });
      expect(result.errors.some((e) => e.code === "INVALID_LAT_ORDER")).toBe(true);
    });

    it("invalid lat → INVALID_LATITUDE", () => {
      const result = GeoValidations.validateBboxCoordinates({
        southWest: { lat: -100, lng: 0 },
        northEast: { lat: 0, lng: 1 },
      });
      expect(result.errors.some((e) => e.code === "INVALID_LATITUDE")).toBe(true);
    });
  });
});
