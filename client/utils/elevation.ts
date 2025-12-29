import { fromBlob } from "geotiff";

export interface ElevationStats {
  min: number;
  max: number;
  avg: number;
}

export async function getElevationAtPoint(
  blob: Blob,
  lat: number,
  lng: number
): Promise<number | null> {
  try {
    const tiff = await fromBlob(blob);
    const image = await tiff.getImage();
    const rasters = await image.readRasters();
    const data = rasters[0] as unknown as Float32Array; // Assuming single band DEM

    const bbox = image.getBoundingBox();
    const width = image.getWidth();
    const height = image.getHeight();

    // bbox format: [minX, minY, maxX, maxY] -> [west, south, east, north]
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
      return data[index];
    }
    return null;
  } catch (error) {
    console.error("Error reading elevation:", error);
    return null;
  }
}

export async function calculateElevationStats(
  blob: Blob,
  coordinates: number[][]
): Promise<ElevationStats | null> {
  // coordinates is an array of [lng, lat] (GeoJSON format)
  try {
    const tiff = await fromBlob(blob);
    const image = await tiff.getImage();
    const rasters = await image.readRasters();
    const data = rasters[0] as unknown as Float32Array;

    const bbox = image.getBoundingBox();
    const width = image.getWidth();
    const height = image.getHeight();
    const [west, south, east, north] = bbox;

    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    let count = 0;

    for (const [lng, lat] of coordinates) {
      if (lng < west || lng > east || lat < south || lat > north) continue;

      const xPct = (lng - west) / (east - west);
      const yPct = (north - lat) / (north - south);

      const x = Math.floor(xPct * width);
      const y = Math.floor(yPct * height);

      const index = y * width + x;

      if (index >= 0 && index < data.length) {
        const val = data[index];
        if (val > -9999) {
          // Avoid no-data values often represented as -9999
          if (val < min) min = val;
          if (val > max) max = val;
          sum += val;
          count++;
        }
      }
    }

    if (count === 0) return null;

    return {
      min,
      max,
      avg: sum / count,
    };
  } catch (error) {
    console.error("Error calculating stats:", error);
    return null;
  }
}
