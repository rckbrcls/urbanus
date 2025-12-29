import {
  ProcessingStages,
  ProcessingErrors,
  BoundingBox,
} from "@/types/map-types";
import { useState, useCallback } from "react";

interface UseDataProcessingOptions {
  onStreetsLoaded?: (geojson: GeoJSON.FeatureCollection, count: number) => void;
}

export function useDataProcessing(options?: UseDataProcessingOptions) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [streetCount, setStreetCount] = useState<number | undefined>(undefined);
  const [topographyBlob, setTopographyBlob] = useState<Blob | null>(null);

  const [stages, setStages] = useState<ProcessingStages>({
    streets: "pending",
    topography: "pending",
  });

  const [errors, setErrors] = useState<ProcessingErrors>({});

  // Buscar ruas
  const fetchStreets = useCallback(
    async (bbox: BoundingBox): Promise<boolean> => {
      setStages((s) => ({ ...s, streets: "loading" }));

      try {
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
          const error = await response.json();
          throw new Error(error.error || "Erro ao buscar ruas");
        }

        const geojson = await response.json();
        const count = geojson.metadata?.totalStreets || geojson.features.length;
        setStreetCount(count);
        setStages((s) => ({ ...s, streets: "success" }));

        options?.onStreetsLoaded?.(geojson, count);

        return true;
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : "Erro desconhecido";
        setErrors((e) => ({ ...e, streets: msg }));
        setStages((s) => ({ ...s, streets: "error" }));
        return false;
      }
    },
    [options]
  );

  // Buscar topografia
  const fetchTopography = useCallback(
    async (bbox: BoundingBox): Promise<boolean> => {
      setStages((s) => ({ ...s, topography: "loading" }));

      try {
        const response = await fetch("/api/topography", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            south: bbox.southWest.lat,
            north: bbox.northEast.lat,
            west: bbox.southWest.lng,
            east: bbox.northEast.lng,
            demType: "COP30",
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Erro ao buscar topografia");
        }

        const blob = await response.blob();
        setTopographyBlob(blob);
        setStages((s) => ({ ...s, topography: "success" }));
        return true;
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : "Erro desconhecido";
        setErrors((e) => ({ ...e, topography: msg }));
        setStages((s) => ({ ...s, topography: "error" }));
        return false;
      }
    },
    []
  );

  // Processar dados completos (ruas + topografia)
  const processData = useCallback(
    async (bbox: BoundingBox) => {
      setIsProcessing(true);
      setStages({ streets: "pending", topography: "pending" });
      setErrors({});
      setStreetCount(undefined);
      setTopographyBlob(null);

      // Etapa 1: Ruas
      const streetsOk = await fetchStreets(bbox);

      // Etapa 2: Topografia
      if (streetsOk) {
        await fetchTopography(bbox);
      } else {
        setStages((s) => ({ ...s, topography: "skipped" }));
      }

      setIsProcessing(false);
    },
    [fetchStreets, fetchTopography]
  );

  // Resetar estado
  const resetProcessing = useCallback(() => {
    setIsProcessing(false);
    setStreetCount(undefined);
    setTopographyBlob(null);
    setStages({ streets: "pending", topography: "pending" });
    setErrors({});
  }, []);

  // Download topografia
  const downloadTopography = useCallback(() => {
    if (!topographyBlob) return;
    const url = window.URL.createObjectURL(topographyBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `topografia_${Date.now()}.tif`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }, [topographyBlob]);

  return {
    isProcessing,
    streetCount,
    topographyBlob,
    stages,
    errors,
    processData,
    resetProcessing,
    downloadTopography,
  };
}
