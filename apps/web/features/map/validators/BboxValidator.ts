/**
 * Validador de Bounding Box
 */

import { GeoValidations } from "@urbanus/geo";
import type { ValidationError, ValidationResult, BoundingBox, LatLng } from "@urbanus/geo";

export class BboxValidator {
  /**
   * Valida o formato do bbox
   */
  validateFormat(bbox: unknown): ValidationResult {
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
  }

  /**
   * Valida se as coordenadas estão em ranges válidos
   */
  validateCoordinates(bbox: BoundingBox): ValidationResult {
    const errors: ValidationError[] = [];

    // Latitude: -90 a 90
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

    // Longitude: -180 a 180
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

    // Verificar se south < north
    if (bbox.southWest.lat >= bbox.northEast.lat) {
      errors.push({
        code: "INVALID_LAT_ORDER",
        message: "Latitude sul deve ser menor que latitude norte",
        field: "latitude",
      });
    }

    // Verificar se west < east (considerando antimeridiano)
    if (bbox.southWest.lng >= bbox.northEast.lng) {
      errors.push({
        code: "INVALID_LNG_ORDER",
        message: "Longitude oeste deve ser menor que longitude leste",
        field: "longitude",
      });
    }

    return { valid: errors.length === 0, errors };
  }

  private isValidLatLng(value: unknown): value is LatLng {
    if (!value || typeof value !== "object") return false;
    const v = value as Record<string, unknown>;
    return (
      typeof v.lat === "number" &&
      typeof v.lng === "number" &&
      !isNaN(v.lat) &&
      !isNaN(v.lng)
    );
  }

  private isValidLatitude(lat: number): boolean {
    return lat >= -90 && lat <= 90;
  }

  private isValidLongitude(lng: number): boolean {
    return lng >= -180 && lng <= 180;
  }
}
