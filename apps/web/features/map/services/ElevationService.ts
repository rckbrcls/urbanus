/**
 * Elevation service (server-side enrichment).
 *
 * Calls POST /api/elevation/enrich with GeoJSON + bbox.
 * GeoTIFF fetch and elevation lookup run on Python (rasterio + numpy).
 */

import type { BoundingBox } from "../types";
import type {
  DEMType,
  EnrichedFeatureCollection,
} from "../types/elevation.types";

export type ElevationErrorCode =
  | "FETCH_ERROR"
  | "RATE_LIMITED"
  | "PROCESSING_ERROR"
  | "UNKNOWN_ERROR";

export class ElevationError extends Error {
  constructor(
    message: string,
    public code: ElevationErrorCode,
  ) {
    super(message);
    this.name = "ElevationError";
  }

  isRetryable(): boolean {
    return ["FETCH_ERROR", "RATE_LIMITED", "PROCESSING_ERROR"].includes(
      this.code,
    );
  }
}

export interface FetchEnrichedOptions {
  demType?: DEMType;
}

/**
 * Singleton elevation service. Enrichment is done server-side (Python).
 */
export class ElevationService {
  private static instance: ElevationService;

  private constructor() {}

  static getInstance(): ElevationService {
    if (!this.instance) {
      this.instance = new ElevationService();
    }
    return this.instance;
  }

  /**
   * Enrich GeoJSON with elevation via server (Python + rasterio).
   * Returns enriched FeatureCollection (vertex_elevations, elevation stats).
   */
  async fetchEnrichedGeoJSON(
    geojson: GeoJSON.FeatureCollection,
    bbox: BoundingBox,
    options: FetchEnrichedOptions = {},
  ): Promise<EnrichedFeatureCollection> {
    const { demType = "COP30" } = options;

    const body = {
      geojson,
      bbox: {
        south: bbox.southWest.lat,
        north: bbox.northEast.lat,
        west: bbox.southWest.lng,
        east: bbox.northEast.lng,
      },
      demType,
    };

    try {
      const res = await fetch("/api/elevation/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        let msg = "Failed to enrich with elevation";
        try {
          const j = await res.json();
          msg = (j as { error?: string }).error ?? msg;
        } catch {
          /* ignore */
        }
        if (res.status === 429) {
          throw new ElevationError(
            "Rate limit exceeded. Try again later.",
            "RATE_LIMITED",
          );
        }
        throw new ElevationError(msg, "FETCH_ERROR");
      }

      const enriched = (await res.json()) as EnrichedFeatureCollection;
      return enriched;
    } catch (e) {
      if (e instanceof ElevationError) throw e;
      throw new ElevationError(
        `Elevation error: ${e instanceof Error ? e.message : "Unknown"}`,
        "PROCESSING_ERROR",
      );
    }
  }

  /**
   * Stub: client-side elevation lookup removed (server-side enrichment only).
   * useElevationSync calls this when elevationData is provided; we always return null.
   */
  getElevationAtPoint(
    _data: unknown,
    _lat: number,
    _lng: number,
  ): number | null {
    return null;
  }
}
