/**
 * Hook de Bounding Box
 *
 * Gerencia seleção de área no mapa com validação em tempo real
 */

import { useCallback, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import { BoundingBoxService } from "../services";
import { GeoCalculations, type LatLng, type BoundingBox } from "@urbanus/geo";
import type { BboxValidationResult } from "../types";
import { BBOX_COLORS, MAP_STYLES, AREA_LIMITS } from "../constants";
import { useLeaflet } from "./useLeaflet";

interface UseBoundingBoxOptions {
  mapInstance: Leaflet.Map | null;
  enabled: boolean;
  onSelectionStart?: () => void;
  onSelectionUpdate?: (bbox: BoundingBox, area: number) => void;
  onSelectionEnd?: (result: BboxValidationResult) => void;
  onSelectionCancel?: () => void;
}

export function useBoundingBox(options: UseBoundingBoxOptions) {
  const {
    mapInstance,
    enabled,
    onSelectionStart,
    onSelectionUpdate,
    onSelectionEnd,
    onSelectionCancel,
  } = options;
  const service = BoundingBoxService.getInstance();
  const leaflet = useLeaflet();

  const [isDrawing, setIsDrawing] = useState(false);
  const [currentBbox, setCurrentBbox] = useState<BoundingBox | null>(null);
  const [validation, setValidation] = useState<BboxValidationResult | null>(
    null,
  );

  const startPointRef = useRef<LatLng | null>(null);
  const rectangleRef = useRef<Leaflet.Rectangle | null>(null);

  /**
   * Inicia o modo de seleção de bbox
   */
  const startSelection = useCallback(() => {
    if (!mapInstance) return;

    mapInstance.getContainer().style.cursor = "crosshair";

    // Desabilita interações padrão do mapa
    mapInstance.dragging.disable();
    mapInstance.doubleClickZoom.disable();
  }, [mapInstance]);

  /**
   * Handler para início do desenho (mousedown com shift)
   */
  const handleDrawStart = useCallback(
    (e: Leaflet.LeafletMouseEvent) => {
      if (!enabled || !e.originalEvent.shiftKey) return;

      e.originalEvent.stopPropagation();
      e.originalEvent.preventDefault();

      startPointRef.current = { lat: e.latlng.lat, lng: e.latlng.lng };
      setIsDrawing(true);
      onSelectionStart?.();

      // Limpa retângulo anterior
      if (rectangleRef.current && mapInstance) {
        mapInstance.removeLayer(rectangleRef.current);
        rectangleRef.current = null;
      }
    },
    [enabled, mapInstance, onSelectionStart],
  );

  /**
   * Handler para atualização do desenho (mousemove)
   */
  const handleDrawUpdate = useCallback(
    (e: Leaflet.LeafletMouseEvent) => {
      if (!isDrawing || !startPointRef.current || !mapInstance || !leaflet)
        return;

      const endPoint: LatLng = { lat: e.latlng.lat, lng: e.latlng.lng };
      const bbox = service.createFromPoints(startPointRef.current, endPoint);
      setCurrentBbox(bbox);

      // Calcula área e atualiza estilo
      const area = service.calculateArea(bbox);
      const isValid = service.isAreaValid(area);

      const bounds = leaflet.latLngBounds(
        [bbox.southWest.lat, bbox.southWest.lng],
        [bbox.northEast.lat, bbox.northEast.lng],
      );

      if (rectangleRef.current) {
        rectangleRef.current.setBounds(bounds);
        rectangleRef.current.setStyle(
          isValid ? MAP_STYLES.rectangle.valid : MAP_STYLES.rectangle.invalid,
        );
      } else {
        rectangleRef.current = leaflet.rectangle(bounds, {
          ...MAP_STYLES.rectangle.valid,
          dashArray: "5, 5",
        }).addTo(mapInstance);
      }

      onSelectionUpdate?.(bbox, area);
    },
    [isDrawing, mapInstance, leaflet, service, onSelectionUpdate],
  );

  /**
   * Handler para fim do desenho (mouseup)
   */
  const handleDrawEnd = useCallback(async () => {
    if (!isDrawing || !currentBbox) return;

    setIsDrawing(false);
    startPointRef.current = null;

    // Valida bbox
    const result = await service.validate(currentBbox);
    setValidation(result);

    if (result.valid && rectangleRef.current) {
      rectangleRef.current.setStyle({
        ...MAP_STYLES.rectangle.confirmed,
        dashArray: undefined,
      });
    } else if (!result.valid && rectangleRef.current && mapInstance) {
      // Remove retângulo inválido após delay
      setTimeout(() => {
        if (rectangleRef.current && mapInstance) {
          mapInstance.removeLayer(rectangleRef.current);
          rectangleRef.current = null;
        }
      }, 2000);
    }

    onSelectionEnd?.(result);
  }, [isDrawing, currentBbox, mapInstance, service, onSelectionEnd]);

  /**
   * Cancela seleção atual
   */
  const cancelSelection = useCallback(() => {
    setIsDrawing(false);
    setCurrentBbox(null);
    setValidation(null);
    startPointRef.current = null;

    if (rectangleRef.current && mapInstance) {
      mapInstance.removeLayer(rectangleRef.current);
      rectangleRef.current = null;
    }

    if (mapInstance) {
      mapInstance.getContainer().style.cursor = "";
      mapInstance.dragging.enable();
      mapInstance.doubleClickZoom.enable();
    }

    onSelectionCancel?.();
  }, [mapInstance, onSelectionCancel]);

  /**
   * Limpa retângulo do mapa
   */
  const clearRectangle = useCallback(() => {
    if (rectangleRef.current && mapInstance) {
      mapInstance.removeLayer(rectangleRef.current);
      rectangleRef.current = null;
    }
    setCurrentBbox(null);
    setValidation(null);
  }, [mapInstance]);

  /**
   * Confirma seleção e trava mapa no bbox
   */
  const confirmSelection = useCallback(() => {
    if (!currentBbox || !validation?.valid || !mapInstance) return null;

    // Trava mapa no bbox
    mapInstance.fitBounds(
      [
        [currentBbox.southWest.lat, currentBbox.southWest.lng],
        [currentBbox.northEast.lat, currentBbox.northEast.lng],
      ],
      { padding: [20, 20] },
    );

    mapInstance.setMaxBounds([
      [currentBbox.southWest.lat - 0.01, currentBbox.southWest.lng - 0.01],
      [currentBbox.northEast.lat + 0.01, currentBbox.northEast.lng + 0.01],
    ]);

    // Desabilita interações
    mapInstance.dragging.disable();
    mapInstance.touchZoom.disable();
    mapInstance.scrollWheelZoom.disable();
    mapInstance.boxZoom.disable();
    mapInstance.keyboard.disable();

    return currentBbox;
  }, [currentBbox, validation, mapInstance]);

  return {
    // State
    isDrawing,
    currentBbox,
    validation,
    rectangleRef,

    // Actions
    startSelection,
    cancelSelection,
    confirmSelection,
    clearRectangle,

    // Event handlers (para anexar ao mapa)
    handlers: {
      onMouseDown: handleDrawStart,
      onMouseMove: handleDrawUpdate,
      onMouseUp: handleDrawEnd,
    },
  };
}
