import { fromBlob } from "geotiff";

export interface ElevationStats {
  min: number;
  max: number;
  avg: number;
}

export interface ElevationData {
  data: Float32Array;
  width: number;
  height: number;
  bbox: number[]; // [west, south, east, north]
}

export async function loadElevationData(
  blob: Blob
): Promise<ElevationData | null> {
  try {
    const tiff = await fromBlob(blob);
    const image = await tiff.getImage();
    const rasters = await image.readRasters();
    const data = rasters[0] as unknown as Float32Array; // Assuming single band DEM

    const bbox = image.getBoundingBox();
    const width = image.getWidth();
    const height = image.getHeight();

    return { data, width, height, bbox };
  } catch (error) {
    console.error("Error loading elevation data:", error);
    return null;
  }
}

export function lookupElevation(
  elevationData: ElevationData,
  lat: number,
  lng: number
): number | null {
  const { data, width, height, bbox } = elevationData;
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

  // Get value
  const index = y * width + x;
  if (index >= 0 && index < data.length) {
    const val = data[index];
    // Avoid no-data values often represented as -9999 or similar low values
    if (val > -9000) {
      return val;
    }
  }
  return null;
}

export async function getElevationAtPoint(
  blob: Blob,
  lat: number,
  lng: number
): Promise<number | null> {
  const dataset = await loadElevationData(blob);
  if (!dataset) return null;
  return lookupElevation(dataset, lat, lng);
}

export async function calculateElevationStats(
  blob: Blob,
  coordinates: number[][]
): Promise<ElevationStats | null> {
  const dataset = await loadElevationData(blob);
  if (!dataset) return null;

  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let count = 0;

  for (const [lng, lat] of coordinates) {
    const val = lookupElevation(dataset, lat, lng);
    if (val !== null) {
      if (val < min) min = val;
      if (val > max) max = val;
      sum += val;
      count++;
    }
  }

  if (count === 0) return null;

  return {
    min,
    max,
    avg: sum / count,
  };
}

export async function enrichStreetsWithElevation(
  geojson: GeoJSON.FeatureCollection,
  blob: Blob
): Promise<GeoJSON.FeatureCollection> {
  const dataset = await loadElevationData(blob);
  if (!dataset) return geojson;

  const enrichedFeatures = geojson.features.map((feature) => {
    if (feature.geometry.type !== "LineString") return feature;

    const coordinates = feature.geometry.coordinates as number[][];
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    let count = 0;
    const vertex_elevations: (number | null)[] = [];

    for (const [lng, lat] of coordinates) {
      const val = lookupElevation(dataset, lat, lng);
      vertex_elevations.push(val);
      if (val !== null) {
        if (val < min) min = val;
        if (val > max) max = val;
        sum += val;
        count++;
      }
    }

    if (count > 0) {
      return {
        ...feature,
        properties: {
          ...feature.properties,
          elevation: {
            min,
            max,
            avg: sum / count,
          },
          vertex_elevations,
        },
      };
    }

    return feature;
  });

  return {
    ...geojson,
    features: enrichedFeatures,
  };
}
