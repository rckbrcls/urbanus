import { useEffect, useRef, useCallback, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { HIGHWAY_COLORS } from "@/constants/map-constants";
import { BoundingBox } from "@/types/map-types";
import { loadElevationData, lookupElevation } from "@/utils/elevation";

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
  const verticesLayerRef = useRef<L.LayerGroup | null>(null);
  const zoomControlRef = useRef<L.Control.Zoom | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapInstanceRef.current) return;

    const map = L.map(containerRef.current, {
      center: options.center,
      zoom: options.zoom,
      boxZoom: false, // Disable native boxZoom to use custom selection
      zoomControl: false, // Disable default zoom control to manage manually
      zoomSnap: 0, // CRITICAL: Allow fractional zoom levels for perfect bounding box fit
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    mapInstanceRef.current = map;
    setIsMapReady(true);

    // ResizeObserver to handle container size changes automatically
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapInstanceRef.current = null;
      setIsMapReady(false);
    };
  }, [containerRef, options.center, options.zoom]);
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
        // Precise fit: NO padding, allow deep zoom
        map.fitBounds(bounds, {
          padding: [0, 0],
          maxZoom: 24,
          animate: false,
        });
      }

      // Desabilitar TODAS as interações
      map.dragging.disable();
      map.touchZoom.disable();
      map.doubleClickZoom.disable();
      map.scrollWheelZoom.disable();
      map.boxZoom.disable();
      map.keyboard.disable();

      // Remover controle de zoom via ref
      if (zoomControlRef.current) {
        zoomControlRef.current.remove();
        zoomControlRef.current = null;
      }

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
    if (verticesLayerRef.current) {
      map.removeLayer(verticesLayerRef.current);
      verticesLayerRef.current = null;
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

    // Adicionar controle de zoom se não existir
    if (!zoomControlRef.current) {
      zoomControlRef.current = L.control
        .zoom({ position: "topleft" })
        .addTo(map);
    }
    map.setView(center, zoom);
  }, []);

  // Adicionar camada de ruas GeoJSON
  const addStreetsLayer = useCallback(
    async (
      geojson: GeoJSON.FeatureCollection,
      topographyBlob?: Blob | null
    ) => {
      const map = mapInstanceRef.current;
      if (!map) return;

      if (streetsLayerRef.current) {
        map.removeLayer(streetsLayerRef.current);
      }
      if (verticesLayerRef.current) {
        map.removeLayer(verticesLayerRef.current);
      }

      // Carregar dados de elevação uma única vez
      let elevationDataset = null;
      if (topographyBlob) {
        try {
          elevationDataset = await loadElevationData(topographyBlob);
        } catch (e) {
          console.error("Failed to load elevation data", e);
        }
      }

      const verticesGroup = L.layerGroup();
      verticesLayerRef.current = verticesGroup;

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

            let elevationInfo = "";

            if (elevationDataset && feature.geometry.type === "LineString") {
              const coordinates = feature.geometry.coordinates as number[][];

              // Calcular stats da rua usando os dados carregados
              let min = Infinity;
              let max = -Infinity;
              let sum = 0;
              let count = 0;

              // Iterar vértices para criar pontos e calcular stats
              coordinates.forEach(([lng, lat]) => {
                const el = lookupElevation(elevationDataset!, lat, lng);

                if (el !== null) {
                  // Stats
                  if (el < min) min = el;
                  if (el > max) max = el;
                  sum += el;
                  count++;

                  // Adicionar marcador no vértice
                  L.circleMarker([lat, lng], {
                    radius: 3,
                    color: "#3388ff",
                    fillColor: "#3388ff",
                    fillOpacity: 0.8,
                    weight: 1,
                  })
                    .bindTooltip(`Alt: ${el.toFixed(1)}m`, {
                      direction: "top",
                      offset: [0, -5],
                      className: "vertex-tooltip", // Opcional para styling
                    })
                    .addTo(verticesGroup);
                }
              });

              if (count > 0) {
                const avg = sum / count;
                elevationInfo = `
                      <br/><hr style="margin: 4px 0; border-color: #ddd"/>
                      <div style="font-size: 0.9em; color: #444">
                        <strong>Topografia:</strong><br/>
                        Média: ${avg.toFixed(1)}m<br/>
                        Min: ${min.toFixed(1)}m | Max: ${max.toFixed(1)}m
                      </div>
                    `;
              }
            }

            layer.bindTooltip(
              `
            <div style="font-family: system-ui; line-height: 1.4;">
                <strong>${name}</strong><br/>
                <span style="color: ${
                  HIGHWAY_COLORS[type] || "#666"
                }">${type}</span>
                ${elevationInfo}
            </div>
          `,
              { sticky: true, className: "custom-tooltip" }
            );
          }
        },
      }).addTo(map);

      verticesGroup.addTo(map);
    },
    []
  );

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
    verticesLayerRef,
    lockToBox,
    unlockMap,
    addStreetsLayer,
    invalidateSize,
    refitBounds,
    isMapReady,
  };
}
