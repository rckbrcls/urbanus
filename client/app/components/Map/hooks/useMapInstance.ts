import { useEffect, useRef, useCallback, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { BoundingBox } from "../types";
import { HIGHWAY_COLORS } from "../constants";

// Fix para ícones do Leaflet no Next.js
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: () => void })
  ._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

interface UseMapInstanceOptions {
  center: [number, number];
  zoom: number;
}

export function useMapInstance(
  containerRef: React.RefObject<HTMLDivElement | null>,
  options: UseMapInstanceOptions
) {
  const mapInstanceRef = useRef<L.Map | null>(null);
  const rectangleRef = useRef<L.Rectangle | null>(null);
  const streetsLayerRef = useRef<L.GeoJSON | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);

  // Inicializar mapa
  useEffect(() => {
    if (!containerRef.current || mapInstanceRef.current) return;

    const map = L.map(containerRef.current, {
      center: options.center,
      zoom: options.zoom,
      boxZoom: false, // Desabilitar boxZoom nativo para usar seleção customizada
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    mapInstanceRef.current = map;
    setIsMapReady(true);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      setIsMapReady(false);
    };
  }, [containerRef, options.center, options.zoom]);

  // Travar o mapa em um bounding box específico
  const lockToBox = useCallback(
    (
      bbox: BoundingBox,
      options?: {
        keepZoom?: boolean;
        currentZoom?: number;
        center?: [number, number];
      }
    ) => {
      const map = mapInstanceRef.current;
      if (!map) return;

      const bounds = L.latLngBounds(
        [bbox.southWest.lat, bbox.southWest.lng],
        [bbox.northEast.lat, bbox.northEast.lng]
      );

      if (options?.keepZoom && options.currentZoom !== undefined) {
        // Use provided center or fallback to bounds center (though center should be provided for "stay in place" behavior)
        const centerToUse = options.center || bounds.getCenter();
        map.setView(centerToUse, options.currentZoom, { animate: false });
      } else {
        map.fitBounds(bounds, { padding: [0, 0], animate: false });
      }

      // Desabilitar TODAS as interações
      map.dragging.disable();
      map.touchZoom.disable();
      map.doubleClickZoom.disable();
      map.scrollWheelZoom.disable();
      map.boxZoom.disable();
      map.keyboard.disable();
      map.zoomControl.remove();

      // Remover retângulo de seleção
      if (rectangleRef.current) {
        map.removeLayer(rectangleRef.current);
        rectangleRef.current = null;
      }
    },
    []
  );

  // Desbloquear o mapa para visualização completa
  const unlockMap = useCallback((center: [number, number], zoom: number) => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Limpar camadas
    if (rectangleRef.current) {
      map.removeLayer(rectangleRef.current);
      rectangleRef.current = null;
    }
    if (streetsLayerRef.current) {
      map.removeLayer(streetsLayerRef.current);
      streetsLayerRef.current = null;
    }

    // Resetar limites
    map.setMinZoom(1);
    map.setMaxZoom(19);
    map.setMaxBounds([
      [-90, -180],
      [90, 180],
    ]);

    // Reabilitar interações
    map.dragging.enable();
    map.touchZoom.enable();
    map.doubleClickZoom.enable();
    map.scrollWheelZoom.enable();
    map.boxZoom.disable(); // Manter desabilitado para seleção customizada
    map.keyboard.enable();

    L.control.zoom({ position: "topleft" }).addTo(map);
    map.setView(center, zoom);
  }, []);

  // Adicionar camada de ruas GeoJSON
  const addStreetsLayer = useCallback((geojson: GeoJSON.FeatureCollection) => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (streetsLayerRef.current) {
      map.removeLayer(streetsLayerRef.current);
    }

    streetsLayerRef.current = L.geoJSON(geojson, {
      style: (feature) => {
        const highway = feature?.properties?.highway || "unclassified";
        return {
          color: HIGHWAY_COLORS[highway] || HIGHWAY_COLORS.unclassified,
          weight:
            highway === "motorway" || highway === "trunk"
              ? 4
              : highway === "primary" || highway === "secondary"
              ? 3
              : 2,
          opacity: 0.8,
        };
      },
      onEachFeature: (feature, layer) => {
        const props = feature.properties;
        if (props) {
          const name = props.name || "Sem nome";
          const type = props.highway || "via";
          layer.bindPopup(`
            <strong>${name}</strong><br/>
            <span style="color: ${
              HIGHWAY_COLORS[type] || "#666"
            }">${type}</span>
            ${props.maxspeed ? `<br/>Velocidade: ${props.maxspeed}` : ""}
            ${props.lanes ? `<br/>Faixas: ${props.lanes}` : ""}
            ${props.oneway ? "<br/>Mão única" : ""}
          `);
        }
      },
    }).addTo(map);
  }, []);

  // Invalidar tamanho do mapa (útil após mudanças de container)
  const invalidateSize = useCallback(() => {
    mapInstanceRef.current?.invalidateSize();
  }, []);

  // Reajustar bounds
  const refitBounds = useCallback(
    (
      bbox: BoundingBox,
      options?: {
        keepZoom?: boolean;
        currentZoom?: number;
        center?: [number, number];
      }
    ) => {
      const map = mapInstanceRef.current;
      if (!map) return;

      const bounds = L.latLngBounds(
        [bbox.southWest.lat, bbox.southWest.lng],
        [bbox.northEast.lat, bbox.northEast.lng]
      );

      if (options?.keepZoom && options.currentZoom !== undefined) {
        const centerToUse = options.center || bounds.getCenter();
        map.setView(centerToUse, options.currentZoom, { animate: false });
      } else {
        map.fitBounds(bounds, { padding: [0, 0], animate: false });
      }
    },
    []
  );

  return {
    mapInstanceRef,
    rectangleRef,
    streetsLayerRef,
    lockToBox,
    unlockMap,
    addStreetsLayer,
    invalidateSize,
    refitBounds,
    isMapReady,
  };
}
