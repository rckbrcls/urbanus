/**
 * Streets Service
 *
 * Manages street data requests through the Overpass API.
 * Includes rate limiting and automatic retries.
 */

import type { BoundingBox } from "../types";
import { getGlobalRateLimiter } from "../utils/rateLimiter";
import { withRetry, isRetryableError } from "../utils/retry";

export interface StreetsResult {
  geojson: GeoJSON.FeatureCollection;
  metadata: {
    totalStreets: number;
    areaKm2: number;
    fetchedAt: string;
  };
}

export interface FetchStreetsOptions {
  enableRetry?: boolean;
  maxRetries?: number;
  skipRateLimit?: boolean;
}

export class StreetsService {
  private static instance: StreetsService;
  private rateLimiter = getGlobalRateLimiter();

  private constructor() {}

  static getInstance(): StreetsService {
    if (!this.instance) {
      this.instance = new StreetsService();
    }
    return this.instance;
  }

  async fetchStreets(
    bbox: BoundingBox,
    options: FetchStreetsOptions = {},
  ): Promise<StreetsResult> {
    const {
      enableRetry = true,
      maxRetries = 3,
      skipRateLimit = false,
    } = options;

    // Verificar rate limit
    if (!skipRateLimit) {
      const limitCheck = this.rateLimiter.acquire("streets");
      if (!limitCheck.allowed) {
        throw new StreetsError(
          `Request limit exceeded. Try again in ${Math.ceil((limitCheck.retryAfter || 5000) / 1000)}s`,
          "RATE_LIMITED",
        );
      }
    }

    const fetchFn = async () => {
      const response = await fetch("/api/streets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          south: bbox.southWest.lat,
          north: bbox.northEast.lat,
          west: bbox.southWest.lng,
          east: bbox.northEast.lng,
        }),
      });

      if (!response.ok) {
        let errorMessage = "Unable to fetch streets";
        try {
          const error = await response.json();
          errorMessage = error.error || errorMessage;
        } catch {
          // Ignore parse error
        }

        if (response.status === 429) {
          throw new StreetsError(
            "Request limit exceeded",
            "RATE_LIMITED",
            response.status,
          );
        }

        throw new StreetsError(errorMessage, "FETCH_ERROR", response.status);
      }

      const geojson = await response.json();
      const count = geojson.metadata?.totalStreets || geojson.features.length;

      return {
        geojson,
        metadata: {
          totalStreets: count,
          areaKm2: geojson.metadata?.areaKm2 || 0,
          fetchedAt: new Date().toISOString(),
        },
      };
    };

    try {
      if (enableRetry) {
        return await withRetry(fetchFn, {
          maxRetries,
          initialDelay: 2000,
          backoffMultiplier: 2,
          retryCondition: isRetryableError,
          onRetry: (attempt, error, delay) => {
            console.log(
              `[StreetsService] Retry ${attempt}/${maxRetries} after error. ` +
                `Next attempt in ${delay}ms`,
              error,
            );
          },
        });
      }
      return await fetchFn();
    } catch (error) {
      if (error instanceof StreetsError) throw error;
      throw new StreetsError(
        `Unable to fetch streets: ${error instanceof Error ? error.message : "Unknown error"}`,
        "UNKNOWN_ERROR",
      );
    }
  }

  /**
   * Verifica status do rate limit
   */
  getRateLimitStatus() {
    return this.rateLimiter.getStatus("streets");
  }

  /**
   * Reseta rate limit (para testes)
   */
  resetRateLimit() {
    this.rateLimiter.reset("streets");
  }

  /**
   * Filtra features por tipo de highway
   */
  filterByHighwayTypes(
    geojson: GeoJSON.FeatureCollection,
    types: string[],
  ): GeoJSON.FeatureCollection {
    const typeSet = new Set(types.map((t) => t.toLowerCase()));

    return {
      ...geojson,
      features: geojson.features.filter((feature) => {
        const highway = feature.properties?.highway?.toLowerCase();
        return highway && typeSet.has(highway);
      }),
    };
  }

  /**
   * Obtém estatísticas de um GeoJSON de ruas
   */
  getStats(geojson: GeoJSON.FeatureCollection): {
    totalStreets: number;
    byType: Record<string, number>;
    totalVertices: number;
  } {
    const byType: Record<string, number> = {};
    let totalVertices = 0;

    geojson.features.forEach((feature) => {
      if (feature.geometry.type === "LineString") {
        const highway = feature.properties?.highway || "unclassified";
        byType[highway] = (byType[highway] || 0) + 1;
        totalVertices += (feature.geometry.coordinates as number[][]).length;
      }
    });

    return {
      totalStreets: geojson.features.length,
      byType,
      totalVertices,
    };
  }
}

/**
 * Códigos de erro para operações com ruas
 */
export type StreetsErrorCode =
  | "FETCH_ERROR"
  | "RATE_LIMITED"
  | "PARSE_ERROR"
  | "UNKNOWN_ERROR";

/**
 * Classe de erro customizada para operações com ruas
 */
export class StreetsError extends Error {
  public status?: number;

  constructor(
    message: string,
    public code: StreetsErrorCode,
    status?: number,
  ) {
    super(message);
    this.name = "StreetsError";
    this.status = status;
  }

  /**
   * Verifica se o erro é recuperável
   */
  isRetryable(): boolean {
    return ["FETCH_ERROR", "RATE_LIMITED"].includes(this.code);
  }
}
