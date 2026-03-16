/**
 * Geospatial validations.
 *
 * Coordinate and bbox validation functions.
 */

import type { LatLng, BoundingBox, ValidationError, ValidationResult } from "./types";

export const GeoValidations = {
  isValidCoordinate(value: unknown): value is number {
    return typeof value === "number" && isFinite(value) && !isNaN(value);
  },

  isValidLatitude(lat: number): boolean {
    return this.isValidCoordinate(lat) && lat >= -90 && lat <= 90;
  },

  isValidLongitude(lng: number): boolean {
    return this.isValidCoordinate(lng) && lng >= -180 && lng <= 180;
  },

  isValidLatLng(latlng: unknown): latlng is LatLng {
    if (!latlng || typeof latlng !== "object") return false;
    const ll = latlng as Record<string, unknown>;
    return (
      this.isValidLatitude(ll.lat as number) &&
      this.isValidLongitude(ll.lng as number)
    );
  },

  isValidBbox(bbox: unknown): bbox is BoundingBox {
    if (!bbox || typeof bbox !== "object") return false;
    const b = bbox as Record<string, unknown>;
    return this.isValidLatLng(b.southWest) && this.isValidLatLng(b.northEast);
  },

  clampLatitude(lat: number): number {
    return Math.max(-90, Math.min(90, lat));
  },

  clampLongitude(lng: number): number {
    return Math.max(-180, Math.min(180, lng));
  },

  isValidGeoJSON(data: unknown): data is GeoJSON.FeatureCollection {
    if (!data || typeof data !== "object") return false;
    const geo = data as Record<string, unknown>;
    return geo.type === "FeatureCollection" && Array.isArray(geo.features);
  },

  sanitizeGeoJSON(data: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection {
    return {
      ...data,
      features: data.features.filter((feature) => {
        if (!feature.geometry) return false;
        if (feature.geometry.type === "LineString") {
          const coords = feature.geometry.coordinates;
          return (
            Array.isArray(coords) &&
            coords.length >= 2 &&
            coords.every(
              (c) =>
                Array.isArray(c) &&
                c.length >= 2 &&
                this.isValidLongitude(c[0]) &&
                this.isValidLatitude(c[1]),
            )
          );
        }
        return true;
      }),
    };
  },

  validateBboxFormat(bbox: unknown): ValidationResult {
    const errors: ValidationError[] = [];

    if (!bbox || typeof bbox !== "object") {
      return {
        valid: false,
        errors: [
          { code: "INVALID_FORMAT", message: "Bbox deve ser um objeto" },
        ],
      };
    }

    const b = bbox as Record<string, unknown>;

    if (!this.isValidLatLng(b.southWest)) {
      errors.push({
        code: "INVALID_SOUTHWEST",
        message: "southWest deve ter lat e lng válidos",
        field: "southWest",
      });
    }

    if (!this.isValidLatLng(b.northEast)) {
      errors.push({
        code: "INVALID_NORTHEAST",
        message: "northEast deve ter lat e lng válidos",
        field: "northEast",
      });
    }

    return { valid: errors.length === 0, errors };
  },

  validateBboxCoordinates(bbox: BoundingBox): ValidationResult {
    const errors: ValidationError[] = [];

    if (!this.isValidLatitude(bbox.southWest.lat)) {
      errors.push({
        code: "INVALID_LATITUDE",
        message: `Latitude sul (${bbox.southWest.lat}) fora do range válido (-90 a 90)`,
        field: "southWest.lat",
      });
    }

    if (!this.isValidLatitude(bbox.northEast.lat)) {
      errors.push({
        code: "INVALID_LATITUDE",
        message: `Latitude norte (${bbox.northEast.lat}) fora do range válido (-90 a 90)`,
        field: "northEast.lat",
      });
    }

    if (!this.isValidLongitude(bbox.southWest.lng)) {
      errors.push({
        code: "INVALID_LONGITUDE",
        message: `Longitude oeste (${bbox.southWest.lng}) fora do range válido (-180 a 180)`,
        field: "southWest.lng",
      });
    }

    if (!this.isValidLongitude(bbox.northEast.lng)) {
      errors.push({
        code: "INVALID_LONGITUDE",
        message: `Longitude leste (${bbox.northEast.lng}) fora do range válido (-180 a 180)`,
        field: "northEast.lng",
      });
    }

    if (bbox.southWest.lat >= bbox.northEast.lat) {
      errors.push({
        code: "INVALID_LAT_ORDER",
        message: "Latitude sul deve ser menor que latitude norte",
        field: "latitude",
      });
    }

    if (bbox.southWest.lng >= bbox.northEast.lng) {
      errors.push({
        code: "INVALID_LNG_ORDER",
        message: "Longitude oeste deve ser menor que longitude leste",
        field: "longitude",
      });
    }

    return { valid: errors.length === 0, errors };
  },
};
