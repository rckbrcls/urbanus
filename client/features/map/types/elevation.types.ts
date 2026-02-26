/**
 * Tipos de Elevação
 */

export interface ElevationData {
  data: Float32Array;
  width: number;
  height: number;
  bbox: number[]; // [west, south, east, north]
  resolution?: {
    x: number; // metros por pixel horizontal
    y: number; // metros por pixel vertical
  };
  noDataValue?: number;
}

export interface ElevationStats {
  min: number | null;
  max: number | null;
  avg: number | null;
  count: number;
}

export interface ElevationFetchOptions {
  demType?: DEMType;
  useCache?: boolean;
}

export interface ElevationResult {
  data: ElevationData;
  fromCache: boolean;
}

export type DEMType = "COP30" | "SRTM" | "AW3D30";

export interface ElevationCacheEntry {
  data: ElevationData;
  bbox: {
    southWest: { lat: number; lng: number };
    northEast: { lat: number; lng: number };
  };
  timestamp: number;
}

export interface GeoTIFFMetadata {
  width: number;
  height: number;
  bbox: number[];
  resolution: { x: number; y: number };
  samplesPerPixel: number;
  bitsPerSample: number;
  noDataValue?: number;
}

export interface InterpolationOptions {
  method: "nearest" | "bilinear";
}

export interface ElevationProfile {
  distance: number; // distância em metros desde o início
  elevation: number | null;
  lat: number;
  lng: number;
}

export interface StreetElevationData {
  min: number | null;
  max: number | null;
  avg: number | null;
  range: number | null;
  vertexElevations: (number | null)[];
}

// ============ ENRICHED GEOJSON TYPES ============

/** Properties de elevação injetadas pelo servidor (elevation.py) */
export interface EnrichedElevationStats {
  min: number | null;
  max: number | null;
  avg: number | null;
  range: number | null;
}

/** Properties de uma rua enriquecida (Overpass + elevation.py) */
export interface EnrichedStreetProperties {
  id: number;
  name: string | null;
  highway: string;
  surface: string | null;
  lanes: number | null;
  maxspeed: string | null;
  oneway: boolean;
  vertex_elevations: (number | null)[];
  elevation: EnrichedElevationStats;
}

/** Feature individual de rua enriquecida */
export type EnrichedFeature = GeoJSON.Feature<
  GeoJSON.LineString,
  EnrichedStreetProperties
>;

/** FeatureCollection de ruas enriquecidas */
export type EnrichedFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.LineString,
  EnrichedStreetProperties
>;
