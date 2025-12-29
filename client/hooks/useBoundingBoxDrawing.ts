import { useEffect, useState, useCallback, useRef } from "react";
import L from "leaflet";
import { MAX_AREA_KM2, MAP_STYLES } from "@/constants/map-constants";
import { BoundingBox } from "@/types/map-types";

interface UseBoundingBoxDrawingOptions {
  mapInstanceRef: React.RefObject<L.Map | null>;
  rectangleRef: React.MutableRefObject<L.Rectangle | null>;
  streetsLayerRef: React.MutableRefObject<L.GeoJSON | null>;
  enabled: boolean;
  isMapReady?: boolean;
  onValidSelection: (bbox: BoundingBox, area: number) => void;
  onInvalidSelection: (error: string) => void;
  // Props para cálculo seguro de projeção sem depender do estado do DOM do Leaflet
  center: [number, number];
  zoom: number;
}

// Calcular área em km²
export function calculateArea(bbox: BoundingBox): number {
  const latDiff = bbox.northEast.lat - bbox.southWest.lat;
  const lonDiff = bbox.northEast.lng - bbox.southWest.lng;
  const avgLat = (bbox.northEast.lat + bbox.southWest.lat) / 2;
  const kmPerDegreeLat = 111.32;
  const kmPerDegreeLon = 111.32 * Math.cos((avgLat * Math.PI) / 180);
  return Math.abs(latDiff * kmPerDegreeLat * lonDiff * kmPerDegreeLon);
}

export function useBoundingBoxDrawing({
  mapInstanceRef,
  rectangleRef,
  streetsLayerRef,
  enabled,
  isMapReady,
  onValidSelection,
  onInvalidSelection,
  center,
  zoom,
}: UseBoundingBoxDrawingOptions) {
  const [isDrawing, setIsDrawing] = useState(false);
  const drawStartRef = useRef<L.LatLng | null>(null);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !enabled) return;

    const container = map.getContainer();

    // Helper robusto para obter LatLng, com fallback seguro usando props externas
    const getLatLngSafe = (e: MouseEvent): L.LatLng | null => {
      try {
        // Tenta usar o método nativo do Leaflet primeiro
        return map.mouseEventToLatLng(e);
      } catch (err) {
        // Fallback: Projeção manual usando props center/zoom (100% matemática, zero DOM interno do Leaflet)
        try {
          const rect = container.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;

          // Usa os valores passados via prop em vez de pedir ao mapa (que pode falhar se o DOM estiver instável)
          const [lat, lng] = center;
          const latLngCenter = L.latLng(lat, lng);

          const containerCenter = { x: rect.width / 2, y: rect.height / 2 };
          const dx = x - containerCenter.x;
          const dy = y - containerCenter.y;

          // Projeta o centro para pixels, aplica o offset, e desprojeta
          const centerPoint = map.project(latLngCenter, zoom);
          const point = centerPoint.add(new L.Point(dx, dy));
          return map.unproject(point, zoom);
        } catch (fallbackErr) {
          console.error(
            "Falha fatal ao calcular coordenadas do mapa:",
            fallbackErr
          );
          return null;
        }
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!drawStartRef.current) return;

      const currentLatLng = getLatLngSafe(e);
      if (!currentLatLng) return;

      const bounds = L.latLngBounds(drawStartRef.current, currentLatLng);

      // Calcular área em tempo real
      const southWest = {
        lat: bounds.getSouthWest().lat,
        lng: bounds.getSouthWest().lng,
      };
      const northEast = {
        lat: bounds.getNorthEast().lat,
        lng: bounds.getNorthEast().lng,
      };
      const currentArea = calculateArea({ southWest, northEast });
      const isTooBig = currentArea > MAX_AREA_KM2;

      const style = isTooBig
        ? MAP_STYLES.rectangle.invalid
        : MAP_STYLES.rectangle.valid;

      if (rectangleRef.current) {
        rectangleRef.current.setBounds(bounds);
        rectangleRef.current.setStyle(style);
      } else {
        rectangleRef.current = L.rectangle(bounds, style).addTo(map);
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!drawStartRef.current) return;

      const currentLatLng = getLatLngSafe(e);

      setIsDrawing(false);

      // Cleanup document listeners
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);

      // Se falhar o cálculo final, usa o último válido ou aborta se não tiver
      if (!currentLatLng) {
        drawStartRef.current = null;
        return;
      }

      const bounds = L.latLngBounds(drawStartRef.current, currentLatLng);

      const bbox: BoundingBox = {
        southWest: {
          lat: bounds.getSouthWest().lat,
          lng: bounds.getSouthWest().lng,
        },
        northEast: {
          lat: bounds.getNorthEast().lat,
          lng: bounds.getNorthEast().lng,
        },
      };

      const area = calculateArea(bbox);
      drawStartRef.current = null;

      if (area > MAX_AREA_KM2) {
        // Área muito grande
        onInvalidSelection(
          `Área muito grande (${area.toFixed(
            1
          )} km²). Máximo: ${MAX_AREA_KM2} km²`
        );
        if (rectangleRef.current) {
          rectangleRef.current.setStyle(MAP_STYLES.rectangle.invalid);
        }
      } else {
        // Área válida
        onValidSelection(bbox, area);
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (e.shiftKey) {
        // Stop bubbling to Leaflet map controls
        e.stopPropagation();
        e.preventDefault();

        const latLng = getLatLngSafe(e);
        if (!latLng) return;

        setIsDrawing(true);
        drawStartRef.current = latLng;

        // Limpar seleção anterior
        if (rectangleRef.current) {
          map.removeLayer(rectangleRef.current);
          rectangleRef.current = null;
        }
        if (streetsLayerRef.current) {
          map.removeLayer(streetsLayerRef.current);
          streetsLayerRef.current = null;
        }

        // Add document listeners for drag
        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
      }
    };

    // Use capture to intercept before Leaflet
    container.addEventListener("mousedown", handleMouseDown, true);

    return () => {
      container.removeEventListener("mousedown", handleMouseDown, true);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [
    mapInstanceRef,
    rectangleRef,
    streetsLayerRef,
    enabled,
    isMapReady,
    onValidSelection,
    onInvalidSelection,
    center,
    zoom,
  ]);

  // Limpar retângulo manualmente
  const clearRectangle = useCallback(() => {
    if (rectangleRef.current && mapInstanceRef.current) {
      mapInstanceRef.current.removeLayer(rectangleRef.current);
      rectangleRef.current = null;
    }
  }, [mapInstanceRef, rectangleRef]);

  return {
    isDrawing,
    clearRectangle,
  };
}
