/**
 * Utilitários de Elevação
 *
 * Funções puras para processamento de dados de elevação (GeoTIFF)
 */

import { fromBlob, GeoTIFF, GeoTIFFImage } from "geotiff";

// ============ TIPOS ============

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

// ============ CONSTANTES ============

const NODATA_THRESHOLD = -9000;
const DEFAULT_NODATA = -9999;

// ============ FUNÇÕES DE CARREGAMENTO ============

/**
 * Carrega dados de elevação de um Blob GeoTIFF
 */
export async function loadElevationData(
  blob: Blob,
): Promise<ElevationData | null> {
  try {
    const tiff = await fromBlob(blob);
    const image = await tiff.getImage();
    const rasters = await image.readRasters();
    const data = rasters[0] as unknown as Float32Array;

    const bbox = image.getBoundingBox();
    const width = image.getWidth();
    const height = image.getHeight();

    // Calcular resolução em metros (aproximada)
    const [west, south, east, north] = bbox;
    const avgLat = (north + south) / 2;
    const metersPerDegreeLat = 111320;
    const metersPerDegreeLon = 111320 * Math.cos((avgLat * Math.PI) / 180);

    const resolution = {
      x: ((east - west) / width) * metersPerDegreeLon,
      y: ((north - south) / height) * metersPerDegreeLat,
    };

    // Tentar obter valor nodata dos metadados
    const noDataValue = image.getGDALNoData() ?? DEFAULT_NODATA;

    return { data, width, height, bbox, resolution, noDataValue };
  } catch (error) {
    console.error("Error loading elevation data:", error);
    return null;
  }
}

/**
 * Extrai metadados de um GeoTIFF sem carregar todos os rasters
 */
export async function getGeoTIFFMetadata(
  blob: Blob,
): Promise<GeoTIFFMetadata | null> {
  try {
    const tiff = await fromBlob(blob);
    const image = await tiff.getImage();

    const bbox = image.getBoundingBox();
    const width = image.getWidth();
    const height = image.getHeight();

    // Calcular resolução
    const [west, south, east, north] = bbox;
    const avgLat = (north + south) / 2;
    const metersPerDegreeLat = 111320;
    const metersPerDegreeLon = 111320 * Math.cos((avgLat * Math.PI) / 180);

    return {
      width,
      height,
      bbox,
      resolution: {
        x: ((east - west) / width) * metersPerDegreeLon,
        y: ((north - south) / height) * metersPerDegreeLat,
      },
      samplesPerPixel: image.getSamplesPerPixel(),
      bitsPerSample: image.getBitsPerSample(),
      noDataValue: image.getGDALNoData() ?? undefined,
    };
  } catch (error) {
    console.error("Error reading GeoTIFF metadata:", error);
    return null;
  }
}

// ============ FUNÇÕES DE VALIDAÇÃO ============

/**
 * Valida integridade de dados de elevação
 */
export function validateElevationData(data: ElevationData): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Verificar campos obrigatórios
  if (!data.data) {
    errors.push("Dados de raster ausentes");
  }
  if (!data.width || data.width <= 0) {
    errors.push("Largura inválida");
  }
  if (!data.height || data.height <= 0) {
    errors.push("Altura inválida");
  }
  if (!data.bbox || data.bbox.length !== 4) {
    errors.push("Bounding box inválido");
  }

  // Verificar consistência
  if (data.data && data.width && data.height) {
    if (data.data.length !== data.width * data.height) {
      errors.push(
        `Tamanho de dados inconsistente: esperado ${data.width * data.height}, recebido ${data.data.length}`,
      );
    }
  }

  // Verificar se tem dados válidos (não todos nodata)
  if (data.data) {
    const noDataValue = data.noDataValue ?? DEFAULT_NODATA;
    const validCount = countValidPixels(data.data, noDataValue);
    if (validCount === 0) {
      errors.push("Todos os pixels são nodata");
    }
  }

  // Verificar bbox
  if (data.bbox) {
    const [west, south, east, north] = data.bbox;
    if (west >= east) {
      errors.push("Longitudes do bbox invertidas");
    }
    if (south >= north) {
      errors.push("Latitudes do bbox invertidas");
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Conta pixels válidos (não-nodata)
 */
function countValidPixels(data: Float32Array, noDataValue: number): number {
  let count = 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i] > NODATA_THRESHOLD && data[i] !== noDataValue) {
      count++;
    }
  }
  return count;
}

// ============ FUNÇÕES DE LOOKUP ============

/**
 * Obtém elevação para um ponto usando vizinho mais próximo
 */
export function lookupElevation(
  elevationData: ElevationData,
  lat: number,
  lng: number,
): number | null {
  const {
    data,
    width,
    height,
    bbox,
    noDataValue = DEFAULT_NODATA,
  } = elevationData;
  const [west, south, east, north] = bbox;

  // Check if point is inside bounds
  if (lng < west || lng > east || lat < south || lat > north) {
    return null;
  }

  // Calculate pixel coordinates
  const xPct = (lng - west) / (east - west);
  const yPct = (north - lat) / (north - south); // Top-left origin for pixels

  const x = Math.floor(xPct * width);
  const y = Math.floor(yPct * height);

  // Clamp to valid range
  const clampedX = Math.max(0, Math.min(width - 1, x));
  const clampedY = Math.max(0, Math.min(height - 1, y));

  // Get value
  const index = clampedY * width + clampedX;
  if (index >= 0 && index < data.length) {
    const val = data[index];
    // Avoid no-data values
    if (val > NODATA_THRESHOLD && val !== noDataValue) {
      return val;
    }
  }
  return null;
}

/**
 * Obtém elevação usando interpolação bilinear para maior precisão
 */
export function lookupElevationBilinear(
  elevationData: ElevationData,
  lat: number,
  lng: number,
): number | null {
  const {
    data,
    width,
    height,
    bbox,
    noDataValue = DEFAULT_NODATA,
  } = elevationData;
  const [west, south, east, north] = bbox;

  // Check if point is inside bounds
  if (lng < west || lng > east || lat < south || lat > north) {
    return null;
  }

  // Calculate fractional pixel coordinates
  const xFrac = ((lng - west) / (east - west)) * (width - 1);
  const yFrac = ((north - lat) / (north - south)) * (height - 1);

  const x0 = Math.floor(xFrac);
  const y0 = Math.floor(yFrac);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);

  const xWeight = xFrac - x0;
  const yWeight = yFrac - y0;

  // Get four corner values
  const getValue = (x: number, y: number): number | null => {
    const idx = y * width + x;
    if (idx >= 0 && idx < data.length) {
      const val = data[idx];
      if (val > NODATA_THRESHOLD && val !== noDataValue) {
        return val;
      }
    }
    return null;
  };

  const v00 = getValue(x0, y0);
  const v10 = getValue(x1, y0);
  const v01 = getValue(x0, y1);
  const v11 = getValue(x1, y1);

  // If any corner is null, fallback to nearest neighbor
  if (v00 === null || v10 === null || v01 === null || v11 === null) {
    return lookupElevation(elevationData, lat, lng);
  }

  // Bilinear interpolation
  const top = v00 * (1 - xWeight) + v10 * xWeight;
  const bottom = v01 * (1 - xWeight) + v11 * xWeight;
  return top * (1 - yWeight) + bottom * yWeight;
}

/**
 * Obtém elevações para múltiplos pontos
 */
export function lookupElevations(
  elevationData: ElevationData,
  points: Array<{ lat: number; lng: number }>,
  options: InterpolationOptions = { method: "nearest" },
): (number | null)[] {
  const lookupFn =
    options.method === "bilinear" ? lookupElevationBilinear : lookupElevation;
  return points.map((point) => lookupFn(elevationData, point.lat, point.lng));
}

// ============ FUNÇÕES DE ESTATÍSTICAS ============

/**
 * Calcula estatísticas de elevação para um conjunto de valores
 */
export function calculateElevationStats(
  elevations: (number | null)[],
): ElevationStats {
  const valid = elevations.filter((e): e is number => e !== null);

  if (valid.length === 0) {
    return { min: null, max: null, avg: null, count: 0 };
  }

  return {
    min: Math.min(...valid),
    max: Math.max(...valid),
    avg: valid.reduce((a, b) => a + b, 0) / valid.length,
    count: valid.length,
  };
}

/**
 * Calcula estatísticas de elevação para todo o raster
 */
export function calculateRasterStats(data: ElevationData): ElevationStats & {
  stdDev: number | null;
  percentiles?: { p10: number; p50: number; p90: number };
} {
  const noDataValue = data.noDataValue ?? DEFAULT_NODATA;
  const validValues: number[] = [];

  for (let i = 0; i < data.data.length; i++) {
    const val = data.data[i];
    if (val > NODATA_THRESHOLD && val !== noDataValue) {
      validValues.push(val);
    }
  }

  if (validValues.length === 0) {
    return { min: null, max: null, avg: null, count: 0, stdDev: null };
  }

  const min = Math.min(...validValues);
  const max = Math.max(...validValues);
  const avg = validValues.reduce((a, b) => a + b, 0) / validValues.length;

  // Desvio padrão
  const squaredDiffs = validValues.map((v) => (v - avg) ** 2);
  const avgSquaredDiff =
    squaredDiffs.reduce((a, b) => a + b, 0) / validValues.length;
  const stdDev = Math.sqrt(avgSquaredDiff);

  // Percentis
  validValues.sort((a, b) => a - b);
  const getPercentile = (p: number) =>
    validValues[Math.floor((p / 100) * validValues.length)];

  return {
    min,
    max,
    avg,
    count: validValues.length,
    stdDev,
    percentiles: {
      p10: getPercentile(10),
      p50: getPercentile(50),
      p90: getPercentile(90),
    },
  };
}

// ============ FUNÇÕES DE ENRIQUECIMENTO ============

/**
 * Calcula elevação para coordenadas de uma LineString
 */
export function getLineElevations(
  elevationData: ElevationData,
  coordinates: number[][],
  options: InterpolationOptions = { method: "nearest" },
): {
  elevations: (number | null)[];
  stats: ElevationStats;
  gradient: (number | null)[];
} {
  const points = coordinates.map(([lng, lat]) => ({ lat, lng }));
  const elevations = lookupElevations(elevationData, points, options);
  const stats = calculateElevationStats(elevations);

  // Calcular gradiente (diferença de elevação entre pontos consecutivos)
  const gradient: (number | null)[] = [];
  for (let i = 0; i < elevations.length - 1; i++) {
    const current = elevations[i];
    const next = elevations[i + 1];
    if (current !== null && next !== null) {
      gradient.push(next - current);
    } else {
      gradient.push(null);
    }
  }

  return { elevations, stats, gradient };
}

/**
 * Enriquece GeoJSON com dados de elevação
 */
export function enrichGeoJSONWithElevation(
  geojson: GeoJSON.FeatureCollection,
  elevationData: ElevationData,
  options: InterpolationOptions = { method: "nearest" },
): GeoJSON.FeatureCollection {
  const enrichedFeatures = geojson.features.map((feature) => {
    if (feature.geometry.type !== "LineString") {
      return feature;
    }

    const coordinates = feature.geometry.coordinates as number[][];
    const { elevations, stats, gradient } = getLineElevations(
      elevationData,
      coordinates,
      options,
    );

    // Calcular inclinação máxima se tiver dados suficientes
    const validGradients = gradient.filter((g): g is number => g !== null);
    const maxSlope =
      validGradients.length > 0
        ? Math.max(...validGradients.map(Math.abs))
        : null;

    return {
      ...feature,
      properties: {
        ...feature.properties,
        elevation: {
          min: stats.min,
          max: stats.max,
          avg: stats.avg,
          range:
            stats.min !== null && stats.max !== null
              ? stats.max - stats.min
              : null,
        },
        vertex_elevations: elevations,
        max_slope: maxSlope,
      },
    };
  });

  return {
    ...geojson,
    features: enrichedFeatures,
  };
}

/**
 * Função legado para compatibilidade com código existente
 */
export async function enrichStreetsWithElevation(
  geojson: GeoJSON.FeatureCollection,
  blob: Blob,
): Promise<GeoJSON.FeatureCollection> {
  const dataset = await loadElevationData(blob);
  if (!dataset) return geojson;
  return enrichGeoJSONWithElevation(geojson, dataset);
}

/**
 * Obtém elevação em um ponto a partir de um blob
 */
export async function getElevationAtPoint(
  blob: Blob,
  lat: number,
  lng: number,
): Promise<number | null> {
  const dataset = await loadElevationData(blob);
  if (!dataset) return null;
  return lookupElevation(dataset, lat, lng);
}
