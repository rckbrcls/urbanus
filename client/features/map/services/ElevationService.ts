/**
 * Serviço de Elevação com Cache
 *
 * Gerencia busca, cache e processamento de dados de elevação
 * Usa as funções puras de /lib/geo/elevation para operações de baixo nível
 */

import {
  loadElevationData,
  validateElevationData,
  lookupElevation,
  lookupElevationBilinear,
  lookupElevations,
  calculateElevationStats,
  calculateRasterStats,
  enrichGeoJSONWithElevation,
  getGeoTIFFMetadata,
  type ElevationData,
  type ElevationStats,
  type InterpolationOptions,
  type GeoTIFFMetadata,
} from "@/lib/geo/elevation";
import type { BoundingBox } from "../types";
import type {
  ElevationResult,
  ElevationFetchOptions,
  ElevationCacheEntry,
  DEMType,
} from "../types/elevation.types";
import { ELEVATION_CACHE } from "../constants";

// Re-exportar tipos úteis
export type { ElevationData, ElevationStats, GeoTIFFMetadata };

/**
 * Serviço de Elevação com Cache (Singleton)
 */
export class ElevationService {
  private static instance: ElevationService;
  private cache: Map<string, ElevationCacheEntry> = new Map();
  private pendingRequests: Map<string, Promise<ElevationResult>> = new Map();

  private constructor() {}

  static getInstance(): ElevationService {
    if (!this.instance) {
      this.instance = new ElevationService();
    }
    return this.instance;
  }

  // ============ CACHE MANAGEMENT ============

  /**
   * Gera chave de cache para um bbox
   */
  private getCacheKey(bbox: BoundingBox, demType: DEMType = "COP30"): string {
    return `${bbox.southWest.lat.toFixed(4)},${bbox.southWest.lng.toFixed(4)},${bbox.northEast.lat.toFixed(4)},${bbox.northEast.lng.toFixed(4)},${demType}`;
  }

  /**
   * Verifica se existe cache válido
   */
  private getCachedData(
    bbox: BoundingBox,
    demType: DEMType = "COP30",
  ): ElevationData | null {
    const key = this.getCacheKey(bbox, demType);
    const entry = this.cache.get(key);

    if (!entry) return null;

    // Verifica TTL
    if (Date.now() - entry.timestamp > ELEVATION_CACHE.TTL_MS) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Adiciona dados ao cache com LRU eviction
   */
  private setCachedData(
    bbox: BoundingBox,
    data: ElevationData,
    demType: DEMType = "COP30",
  ): void {
    // Remove entradas antigas se cache cheio (LRU)
    if (this.cache.size >= ELEVATION_CACHE.MAX_ENTRIES) {
      const entries = Array.from(this.cache.entries());
      const oldestKey = entries.sort(
        ([, a], [, b]) => a.timestamp - b.timestamp,
      )[0][0];
      this.cache.delete(oldestKey);
    }

    this.cache.set(this.getCacheKey(bbox, demType), {
      data,
      bbox,
      timestamp: Date.now(),
    });
  }

  /**
   * Verifica se um bbox está coberto por cache existente
   */
  isCovered(bbox: BoundingBox, demType: DEMType = "COP30"): boolean {
    return this.getCachedData(bbox, demType) !== null;
  }

  /**
   * Obtém estatísticas do cache
   */
  getCacheStats(): {
    entries: number;
    maxEntries: number;
    oldestEntry: number | null;
    newestEntry: number | null;
  } {
    const entries = Array.from(this.cache.values());
    const timestamps = entries.map((e) => e.timestamp);

    return {
      entries: this.cache.size,
      maxEntries: ELEVATION_CACHE.MAX_ENTRIES,
      oldestEntry: timestamps.length > 0 ? Math.min(...timestamps) : null,
      newestEntry: timestamps.length > 0 ? Math.max(...timestamps) : null,
    };
  }

  /**
   * Limpa cache
   */
  clearCache(): void {
    this.cache.clear();
    this.pendingRequests.clear();
  }

  /**
   * Remove entradas expiradas do cache
   */
  pruneExpired(): number {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > ELEVATION_CACHE.TTL_MS) {
        this.cache.delete(key);
        removed++;
      }
    }

    return removed;
  }

  // ============ DATA LOADING ============

  /**
   * Carrega dados de elevação de um Blob
   */
  async loadFromBlob(blob: Blob): Promise<ElevationData> {
    const data = await loadElevationData(blob);
    if (!data) {
      throw new ElevationError(
        "Falha ao processar dados de elevação",
        "PARSE_ERROR",
      );
    }

    // Validar dados
    const validation = validateElevationData(data);
    if (!validation.valid) {
      throw new ElevationError(
        `Dados de elevação inválidos: ${validation.errors.join(", ")}`,
        "INVALID_DATA",
      );
    }

    return data;
  }

  /**
   * Obtém metadados de um GeoTIFF sem carregar todos os dados
   */
  async getMetadata(blob: Blob): Promise<GeoTIFFMetadata> {
    const metadata = await getGeoTIFFMetadata(blob);
    if (!metadata) {
      throw new ElevationError(
        "Falha ao ler metadados do GeoTIFF",
        "METADATA_ERROR",
      );
    }
    return metadata;
  }

  // ============ FETCH OPERATIONS ============

  /**
   * Busca dados de elevação para um bbox (com deduplicação de requests)
   */
  async fetchElevation(
    bbox: BoundingBox,
    options: ElevationFetchOptions = {},
  ): Promise<ElevationResult> {
    const { demType = "COP30", useCache = true } = options;

    // Verifica cache
    if (useCache) {
      const cached = this.getCachedData(bbox, demType);
      if (cached) {
        return { data: cached, fromCache: true };
      }
    }

    // Verifica se já existe request pendente para mesmo bbox
    const cacheKey = this.getCacheKey(bbox, demType);
    const pendingRequest = this.pendingRequests.get(cacheKey);
    if (pendingRequest) {
      // Reutilizar request existente
      return pendingRequest;
    }

    // Criar novo request
    const requestPromise = this.doFetch(bbox, demType, useCache);
    this.pendingRequests.set(cacheKey, requestPromise);

    try {
      const result = await requestPromise;
      return result;
    } finally {
      this.pendingRequests.delete(cacheKey);
    }
  }

  /**
   * Executa fetch real
   */
  private async doFetch(
    bbox: BoundingBox,
    demType: DEMType,
    useCache: boolean,
  ): Promise<ElevationResult> {
    try {
      const response = await fetch("/api/topography", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          south: bbox.southWest.lat,
          west: bbox.southWest.lng,
          north: bbox.northEast.lat,
          east: bbox.northEast.lng,
          demType,
        }),
      });

      if (!response.ok) {
        let errorMessage = "Falha ao buscar elevação";
        try {
          const error = await response.json();
          errorMessage = error.error || errorMessage;
        } catch {
          // Ignore parse error
        }

        if (response.status === 429) {
          throw new ElevationError(
            "Limite de requisições excedido. Tente novamente mais tarde.",
            "RATE_LIMITED",
          );
        }

        throw new ElevationError(errorMessage, "FETCH_ERROR");
      }

      const contentType = response.headers.get("content-type");
      if (!contentType?.includes("image/tiff")) {
        throw new ElevationError(
          "Resposta não é um GeoTIFF válido",
          "INVALID_RESPONSE",
        );
      }

      const blob = await response.blob();
      const data = await this.loadFromBlob(blob);

      // Cache
      if (useCache) {
        this.setCachedData(bbox, data, demType);
      }

      return { data, fromCache: false };
    } catch (error) {
      if (error instanceof ElevationError) throw error;
      throw new ElevationError(
        `Erro ao processar elevação: ${error instanceof Error ? error.message : "Erro desconhecido"}`,
        "PROCESSING_ERROR",
      );
    }
  }

  // ============ ELEVATION LOOKUP ============

  /**
   * Obtém elevação para um ponto específico
   */
  getElevationAtPoint(
    data: ElevationData,
    lat: number,
    lng: number,
    interpolate = false,
  ): number | null {
    if (interpolate) {
      return lookupElevationBilinear(data, lat, lng);
    }
    return lookupElevation(data, lat, lng);
  }

  /**
   * Obtém elevações para múltiplos pontos
   */
  getElevationsAtPoints(
    data: ElevationData,
    points: Array<{ lat: number; lng: number }>,
    options: InterpolationOptions = { method: "nearest" },
  ): (number | null)[] {
    return lookupElevations(data, points, options);
  }

  // ============ STATISTICS ============

  /**
   * Calcula estatísticas de elevação para um conjunto de pontos
   */
  calculateStats(elevations: (number | null)[]): ElevationStats {
    return calculateElevationStats(elevations);
  }

  /**
   * Calcula estatísticas completas do raster
   */
  calculateRasterStats(data: ElevationData) {
    return calculateRasterStats(data);
  }

  // ============ GEOJSON ENRICHMENT ============

  /**
   * Enriquece GeoJSON com dados de elevação
   */
  enrichGeoJSON(
    geojson: GeoJSON.FeatureCollection,
    elevationData: ElevationData,
    options: InterpolationOptions = { method: "nearest" },
  ): GeoJSON.FeatureCollection {
    return enrichGeoJSONWithElevation(geojson, elevationData, options);
  }

  /**
   * Busca elevação e enriquece GeoJSON em uma operação
   */
  async fetchAndEnrichGeoJSON(
    geojson: GeoJSON.FeatureCollection,
    bbox: BoundingBox,
    options: Partial<ElevationFetchOptions & InterpolationOptions> = {},
  ): Promise<{
    geojson: GeoJSON.FeatureCollection;
    elevationData: ElevationData;
    fromCache: boolean;
  }> {
    const { method = "nearest", ...fetchOptions } = options;
    const result = await this.fetchElevation(bbox, fetchOptions);
    const enriched = this.enrichGeoJSON(geojson, result.data, { method });

    return {
      geojson: enriched,
      elevationData: result.data,
      fromCache: result.fromCache,
    };
  }
}

/**
 * Códigos de erro de elevação
 */
export type ElevationErrorCode =
  | "FETCH_ERROR"
  | "PARSE_ERROR"
  | "INVALID_DATA"
  | "METADATA_ERROR"
  | "INVALID_RESPONSE"
  | "RATE_LIMITED"
  | "PROCESSING_ERROR"
  | "UNKNOWN_ERROR";

/**
 * Classe de erro customizada para operações de elevação
 */
export class ElevationError extends Error {
  constructor(
    message: string,
    public code: ElevationErrorCode,
  ) {
    super(message);
    this.name = "ElevationError";
  }

  /**
   * Verifica se o erro é recuperável (pode tentar de novo)
   */
  isRetryable(): boolean {
    return ["FETCH_ERROR", "RATE_LIMITED", "PROCESSING_ERROR"].includes(
      this.code,
    );
  }
}
