/**
 * Geospatial calculations.
 *
 * Pure functions for area, distance, bbox operations.
 */

import type { LatLng, BoundingBox, BboxDimensions } from "./types";

const KM_PER_DEGREE_LAT = 111.32;

function getKmPerDegreeLon(lat: number): number {
  return KM_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180);
}

export const GeoCalculations = {
  calculateArea(bbox: BoundingBox): number {
    const latDiff = bbox.northEast.lat - bbox.southWest.lat;
    const lonDiff = bbox.northEast.lng - bbox.southWest.lng;
    const avgLat = (bbox.northEast.lat + bbox.southWest.lat) / 2;
    const kmPerDegreeLon = getKmPerDegreeLon(avgLat);
    return Math.abs(latDiff * KM_PER_DEGREE_LAT * lonDiff * kmPerDegreeLon);
  },

  getCenter(bbox: BoundingBox): LatLng {
    return {
      lat: (bbox.northEast.lat + bbox.southWest.lat) / 2,
      lng: (bbox.northEast.lng + bbox.southWest.lng) / 2,
    };
  },

  getDimensions(bbox: BoundingBox): BboxDimensions {
    const latDiff = bbox.northEast.lat - bbox.southWest.lat;
    const lonDiff = bbox.northEast.lng - bbox.southWest.lng;
    const avgLat = (bbox.northEast.lat + bbox.southWest.lat) / 2;
    const kmPerDegreeLon = getKmPerDegreeLon(avgLat);

    return {
      heightKm: latDiff * KM_PER_DEGREE_LAT,
      widthKm: lonDiff * kmPerDegreeLon,
    };
  },

  calculateDistance(p1: LatLng, p2: LatLng): number {
    const R = 6371000;
    const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
    const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((p1.lat * Math.PI) / 180) *
        Math.cos((p2.lat * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  },

  createBboxFromPoints(start: LatLng, end: LatLng): BoundingBox {
    return {
      southWest: {
        lat: Math.min(start.lat, end.lat),
        lng: Math.min(start.lng, end.lng),
      },
      northEast: {
        lat: Math.max(start.lat, end.lat),
        lng: Math.max(start.lng, end.lng),
      },
    };
  },

  adjustBboxByMargin(bbox: BoundingBox, marginKm: number): BoundingBox {
    const marginLat = marginKm / KM_PER_DEGREE_LAT;
    const avgLat = (bbox.northEast.lat + bbox.southWest.lat) / 2;
    const marginLng = marginKm / getKmPerDegreeLon(avgLat);

    return {
      southWest: {
        lat: bbox.southWest.lat - marginLat,
        lng: bbox.southWest.lng - marginLng,
      },
      northEast: {
        lat: bbox.northEast.lat + marginLat,
        lng: bbox.northEast.lng + marginLng,
      },
    };
  },

  isInsideBbox(point: LatLng, bbox: BoundingBox): boolean {
    return (
      point.lat >= bbox.southWest.lat &&
      point.lat <= bbox.northEast.lat &&
      point.lng >= bbox.southWest.lng &&
      point.lng <= bbox.northEast.lng
    );
  },

  bboxToQueryParams(bbox: BoundingBox): URLSearchParams {
    return new URLSearchParams({
      south: bbox.southWest.lat.toString(),
      west: bbox.southWest.lng.toString(),
      north: bbox.northEast.lat.toString(),
      east: bbox.northEast.lng.toString(),
    });
  },

  bboxToOverpass(bbox: BoundingBox): string {
    return `${bbox.southWest.lat},${bbox.southWest.lng},${bbox.northEast.lat},${bbox.northEast.lng}`;
  },
};
