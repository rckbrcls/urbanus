/**
 * Hook de Elevação
 *
 * Gerencia busca e processamento de dados de elevação com estado React
 */

import { useState, useCallback, useRef, useEffect } from "react";
import {
  ElevationService,
  ElevationError,
  type ElevationData,
  type ElevationStats,
} from "../services/ElevationService";
import type { BoundingBox } from "../types";
import type { DEMType, ElevationFetchOptions } from "../types/elevation.types";

interface UseElevationOptions {
  /**
   * Tipo de DEM a usar
   */
  demType?: DEMType;
  /**
   * Se deve usar cache
   */
  useCache?: boolean;
  /**
   * Callback quando dados são carregados
   */
  onSuccess?: (data: ElevationData, fromCache: boolean) => void;
  /**
   * Callback quando ocorre erro
   */
  onError?: (error: ElevationError) => void;
  /**
   * Auto-fetch quando bbox muda
   */
  autoFetch?: boolean;
}

interface UseElevationReturn {
  // Estado
  elevationData: ElevationData | null;
  isLoading: boolean;
  error: ElevationError | null;
  fromCache: boolean;

  // Ações
  fetchElevation: (bbox: BoundingBox) => Promise<ElevationData | null>;
  refetch: () => Promise<ElevationData | null>;
  getElevationAt: (
    lat: number,
    lng: number,
    interpolate?: boolean,
  ) => number | null;
  getElevationsAt: (
    points: Array<{ lat: number; lng: number }>,
  ) => (number | null)[];
  enrichStreets: (
    geojson: GeoJSON.FeatureCollection,
  ) => GeoJSON.FeatureCollection;
  clearCache: () => void;
  reset: () => void;

  // Estatísticas
  rasterStats: ReturnType<
    typeof ElevationService.prototype.calculateRasterStats
  > | null;
  cacheStats: ReturnType<typeof ElevationService.prototype.getCacheStats>;
}

export function useElevation(
  options: UseElevationOptions = {},
): UseElevationReturn {
  const {
    demType = "COP30",
    useCache = true,
    onSuccess,
    onError,
    autoFetch = false,
  } = options;

  const service = ElevationService.getInstance();

  // Estado
  const [elevationData, setElevationData] = useState<ElevationData | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<ElevationError | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [rasterStats, setRasterStats] = useState<ReturnType<
    typeof service.calculateRasterStats
  > | null>(null);

  // Refs para tracking do último bbox
  const lastBboxRef = useRef<BoundingBox | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * Busca dados de elevação
   */
  const fetchElevation = useCallback(
    async (bbox: BoundingBox): Promise<ElevationData | null> => {
      // Cancelar request anterior se existir
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      setIsLoading(true);
      setError(null);
      lastBboxRef.current = bbox;

      try {
        const result = await service.fetchElevation(bbox, {
          demType,
          useCache,
        });

        setElevationData(result.data);
        setFromCache(result.fromCache);

        // Calcular estatísticas do raster
        const stats = service.calculateRasterStats(result.data);
        setRasterStats(stats);

        onSuccess?.(result.data, result.fromCache);
        return result.data;
      } catch (err) {
        const elevError =
          err instanceof ElevationError
            ? err
            : new ElevationError(
                "Erro desconhecido ao buscar elevação",
                "UNKNOWN_ERROR",
              );
        setError(elevError);
        setElevationData(null);
        setRasterStats(null);
        onError?.(elevError);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [service, demType, useCache, onSuccess, onError],
  );

  /**
   * Refetch com último bbox
   */
  const refetch = useCallback(async (): Promise<ElevationData | null> => {
    if (!lastBboxRef.current) return null;
    return fetchElevation(lastBboxRef.current);
  }, [fetchElevation]);

  /**
   * Obtém elevação em um ponto
   */
  const getElevationAt = useCallback(
    (lat: number, lng: number, interpolate = false): number | null => {
      if (!elevationData) return null;
      return service.getElevationAtPoint(elevationData, lat, lng, interpolate);
    },
    [elevationData, service],
  );

  /**
   * Obtém elevações em múltiplos pontos
   */
  const getElevationsAt = useCallback(
    (points: Array<{ lat: number; lng: number }>): (number | null)[] => {
      if (!elevationData) return points.map(() => null);
      return service.getElevationsAtPoints(elevationData, points);
    },
    [elevationData, service],
  );

  /**
   * Enriquece GeoJSON com elevação
   */
  const enrichStreets = useCallback(
    (geojson: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection => {
      if (!elevationData) return geojson;
      return service.enrichGeoJSON(geojson, elevationData);
    },
    [elevationData, service],
  );

  /**
   * Limpa cache
   */
  const clearCache = useCallback(() => {
    service.clearCache();
  }, [service]);

  /**
   * Reseta estado
   */
  const reset = useCallback(() => {
    setElevationData(null);
    setIsLoading(false);
    setError(null);
    setFromCache(false);
    setRasterStats(null);
    lastBboxRef.current = null;
  }, []);

  /**
   * Obter estatísticas do cache
   */
  const cacheStats = service.getCacheStats();

  // Cleanup ao desmontar
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    // Estado
    elevationData,
    isLoading,
    error,
    fromCache,

    // Ações
    fetchElevation,
    refetch,
    getElevationAt,
    getElevationsAt,
    enrichStreets,
    clearCache,
    reset,

    // Estatísticas
    rasterStats,
    cacheStats,
  };
}

/**
 * Hook para buscar elevação em um ponto específico
 */
export function useElevationAtPoint(
  elevationData: ElevationData | null,
  lat: number | null,
  lng: number | null,
  interpolate = false,
): number | null {
  const service = ElevationService.getInstance();

  if (!elevationData || lat === null || lng === null) {
    return null;
  }

  return service.getElevationAtPoint(elevationData, lat, lng, interpolate);
}

/**
 * Hook para estatísticas de um conjunto de elevações
 */
export function useElevationStats(
  elevations: (number | null)[],
): ElevationStats {
  const service = ElevationService.getInstance();
  return service.calculateStats(elevations);
}
