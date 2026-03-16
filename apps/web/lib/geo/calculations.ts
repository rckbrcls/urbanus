/**
 * Cálculos geoespaciais centralizados
 *
 * Este módulo contém todas as funções de cálculo geoespacial,
 * eliminando duplicação de código em diferentes partes da aplicação.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface BoundingBox {
  southWest: LatLng;
  northEast: LatLng;
}

export interface BboxDimensions {
  widthKm: number;
  heightKm: number;
}

/**
 * Constante para conversão de graus para km no eixo latitude
 */
const KM_PER_DEGREE_LAT = 111.32;

/**
 * Calcula km por grau de longitude em uma determinada latitude
 */
function getKmPerDegreeLon(lat: number): number {
  return KM_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180);
}

/**
 * Cálculos geoespaciais
 */
export const GeoCalculations = {
  /**
   * Calcula a área de um bounding box em km²
   */
  calculateArea(bbox: BoundingBox): number {
    const latDiff = bbox.northEast.lat - bbox.southWest.lat;
    const lonDiff = bbox.northEast.lng - bbox.southWest.lng;
    const avgLat = (bbox.northEast.lat + bbox.southWest.lat) / 2;
    const kmPerDegreeLon = getKmPerDegreeLon(avgLat);
    return Math.abs(latDiff * KM_PER_DEGREE_LAT * lonDiff * kmPerDegreeLon);
  },

  /**
   * Obtém o centro de um bounding box
   */
  getCenter(bbox: BoundingBox): LatLng {
    return {
      lat: (bbox.northEast.lat + bbox.southWest.lat) / 2,
      lng: (bbox.northEast.lng + bbox.southWest.lng) / 2,
    };
  },

  /**
   * Obtém as dimensões de um bounding box em km
   */
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

  /**
   * Calcula a distância entre dois pontos usando a fórmula de Haversine
   * Retorna a distância em metros
   */
  calculateDistance(p1: LatLng, p2: LatLng): number {
    const R = 6371000; // Raio da Terra em metros
    const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
    const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((p1.lat * Math.PI) / 180) *
        Math.cos((p2.lat * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  },

  /**
   * Cria um bounding box a partir de dois pontos
   */
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

  /**
   * Expande ou contrai um bbox por uma margem em km
   */
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

  /**
   * Verifica se um ponto está dentro de um bounding box
   */
  isInsideBbox(point: LatLng, bbox: BoundingBox): boolean {
    return (
      point.lat >= bbox.southWest.lat &&
      point.lat <= bbox.northEast.lat &&
      point.lng >= bbox.southWest.lng &&
      point.lng <= bbox.northEast.lng
    );
  },

  /**
   * Converte bbox para formato de query string
   */
  bboxToQueryParams(bbox: BoundingBox): URLSearchParams {
    return new URLSearchParams({
      south: bbox.southWest.lat.toString(),
      west: bbox.southWest.lng.toString(),
      north: bbox.northEast.lat.toString(),
      east: bbox.northEast.lng.toString(),
    });
  },

  /**
   * Converte bbox para formato Overpass
   */
  bboxToOverpass(bbox: BoundingBox): string {
    return `${bbox.southWest.lat},${bbox.southWest.lng},${bbox.northEast.lat},${bbox.northEast.lng}`;
  },
};
