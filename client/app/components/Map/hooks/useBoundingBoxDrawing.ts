import { useEffect, useState, useCallback } from "react";
import L from "leaflet";
import { BoundingBox } from "../types";
import { MAX_AREA_KM2, MAP_STYLES } from "../constants";

interface UseBoundingBoxDrawingOptions {
  mapInstanceRef: React.RefObject<L.Map | null>;
  rectangleRef: React.MutableRefObject<L.Rectangle | null>;
  streetsLayerRef: React.MutableRefObject<L.GeoJSON | null>;
  enabled: boolean;
  onValidSelection: (bbox: BoundingBox, area: number) => void;
  onInvalidSelection: (error: string) => void;
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
  onValidSelection,
  onInvalidSelection,
}: UseBoundingBoxDrawingOptions) {
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<L.LatLng | null>(null);

  // Handler para início do desenho
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !enabled) return;

    const handleMouseDown = (e: L.LeafletMouseEvent) => {
      // Garantir que boxZoom está desabilitado
      if (map.boxZoom.enabled()) {
        map.boxZoom.disable();
      }

      if (e.originalEvent.shiftKey) {
        L.DomEvent.stopPropagation(e.originalEvent);
        L.DomEvent.preventDefault(e.originalEvent);

        map.dragging.disable();
        setIsDrawing(true);
        setDrawStart(e.latlng);

        // Limpar seleção anterior
        if (rectangleRef.current) {
          map.removeLayer(rectangleRef.current);
          rectangleRef.current = null;
        }
        if (streetsLayerRef.current) {
          map.removeLayer(streetsLayerRef.current);
          streetsLayerRef.current = null;
        }
      }
    };

    map.on("mousedown", handleMouseDown);

    return () => {
      map.off("mousedown", handleMouseDown);
    };
  }, [mapInstanceRef, rectangleRef, streetsLayerRef, enabled]);

  // Handlers de desenho (mousemove e mouseup)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !enabled) return;

    const handleMouseMove = (e: L.LeafletMouseEvent) => {
      if (!isDrawing || !drawStart) return;

      const bounds = L.latLngBounds(drawStart, e.latlng);

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

    const handleMouseUp = (e: L.LeafletMouseEvent) => {
      if (!isDrawing || !drawStart) return;

      map.dragging.enable();
      setIsDrawing(false);

      const bounds = L.latLngBounds(drawStart, e.latlng);
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
      setDrawStart(null);

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

    map.on("mousemove", handleMouseMove);
    map.on("mouseup", handleMouseUp);

    return () => {
      map.off("mousemove", handleMouseMove);
      map.off("mouseup", handleMouseUp);
    };
  }, [
    mapInstanceRef,
    rectangleRef,
    isDrawing,
    drawStart,
    enabled,
    onValidSelection,
    onInvalidSelection,
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
