import { describe, it, expect } from "vitest";
import { BboxValidator } from "./BboxValidator";

const validator = new BboxValidator();

describe("BboxValidator", () => {
  describe("validateFormat", () => {
    it("valid bbox → valid", () => {
      const result = validator.validateFormat({
        southWest: { lat: -23.56, lng: -46.64 },
        northEast: { lat: -23.55, lng: -46.63 },
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("null → INVALID_FORMAT", () => {
      const result = validator.validateFormat(null);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe("INVALID_FORMAT");
    });

    it("empty object → INVALID_SOUTHWEST + INVALID_NORTHEAST", () => {
      const result = validator.validateFormat({});
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
    });

    it("missing southWest → INVALID_SOUTHWEST", () => {
      const result = validator.validateFormat({
        northEast: { lat: 0, lng: 0 },
      });
      expect(result.errors.some((e) => e.code === "INVALID_SOUTHWEST")).toBe(true);
    });

    it("NaN in lat → invalid", () => {
      const result = validator.validateFormat({
        southWest: { lat: NaN, lng: 0 },
        northEast: { lat: 0, lng: 0 },
      });
      expect(result.valid).toBe(false);
    });
  });

  describe("validateCoordinates", () => {
    it("valid bbox → valid", () => {
      const result = validator.validateCoordinates({
        southWest: { lat: -23.56, lng: -46.64 },
        northEast: { lat: -23.55, lng: -46.63 },
      });
      expect(result.valid).toBe(true);
    });

    it("south > north → INVALID_LAT_ORDER", () => {
      const result = validator.validateCoordinates({
        southWest: { lat: 10, lng: 0 },
        northEast: { lat: 5, lng: 1 },
      });
      expect(result.errors.some((e) => e.code === "INVALID_LAT_ORDER")).toBe(true);
    });

    it("west > east → INVALID_LNG_ORDER", () => {
      const result = validator.validateCoordinates({
        southWest: { lat: 0, lng: 10 },
        northEast: { lat: 1, lng: 5 },
      });
      expect(result.errors.some((e) => e.code === "INVALID_LNG_ORDER")).toBe(true);
    });

    it("lat out of range → INVALID_LATITUDE", () => {
      const result = validator.validateCoordinates({
        southWest: { lat: -100, lng: 0 },
        northEast: { lat: 0, lng: 1 },
      });
      expect(result.errors.some((e) => e.code === "INVALID_LATITUDE")).toBe(true);
    });

    it("lng out of range → INVALID_LONGITUDE", () => {
      const result = validator.validateCoordinates({
        southWest: { lat: 0, lng: -200 },
        northEast: { lat: 1, lng: 1 },
      });
      expect(result.errors.some((e) => e.code === "INVALID_LONGITUDE")).toBe(true);
    });
  });
});
