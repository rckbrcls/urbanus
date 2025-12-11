"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix para ícones do Leaflet no Next.js
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: () => void })
  ._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

interface BoundingBox {
  southWest: { lat: number; lng: number };
  northEast: { lat: number; lng: number };
}

interface MapProps {
  center?: [number, number];
  zoom?: number;
  onBoundingBoxChange?: (bbox: BoundingBox | null) => void;
  enableBoundingBox?: boolean;
}

export default function Map({
  center = [-23.5505, -46.6333], // São Paulo como padrão
  zoom = 13,
  onBoundingBoxChange,
  enableBoundingBox = true,
}: MapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const rectangleRef = useRef<L.Rectangle | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<L.LatLng | null>(null);
  const [boundingBox, setBoundingBox] = useState<BoundingBox | null>(null);

  // Função para limpar o bounding box
  const clearBoundingBox = useCallback(() => {
    if (rectangleRef.current && mapInstanceRef.current) {
      mapInstanceRef.current.removeLayer(rectangleRef.current);
      rectangleRef.current = null;
    }
    setBoundingBox(null);
    onBoundingBoxChange?.(null);
  }, [onBoundingBoxChange]);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    // Inicializar o mapa
    const map = L.map(mapRef.current, {
      center: center,
      zoom: zoom,
    });

    // Adicionar tile layer do OpenStreetMap
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    mapInstanceRef.current = map;

    if (enableBoundingBox) {
      // Evento de mouse down para iniciar o desenho
      map.on("mousedown", (e: L.LeafletMouseEvent) => {
        if (e.originalEvent.shiftKey) {
          map.dragging.disable();
          setIsDrawing(true);
          setDrawStart(e.latlng);

          // Limpar retângulo anterior
          if (rectangleRef.current) {
            map.removeLayer(rectangleRef.current);
            rectangleRef.current = null;
          }
        }
      });

      // Evento de mouse move para desenhar o retângulo
      map.on("mousemove", (e: L.LeafletMouseEvent) => {
        if (!isDrawing || !drawStart) return;

        const bounds = L.latLngBounds(drawStart, e.latlng);

        if (rectangleRef.current) {
          rectangleRef.current.setBounds(bounds);
        } else {
          rectangleRef.current = L.rectangle(bounds, {
            color: "#3b82f6",
            weight: 2,
            fillOpacity: 0.2,
            fillColor: "#3b82f6",
          }).addTo(map);
        }
      });

      // Evento de mouse up para finalizar o desenho
      map.on("mouseup", (e: L.LeafletMouseEvent) => {
        if (isDrawing && drawStart) {
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

          setBoundingBox(bbox);
          onBoundingBoxChange?.(bbox);
          setDrawStart(null);
        }
      });
    }

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Efeito separado para atualizar os handlers quando isDrawing ou drawStart mudam
  useEffect(() => {
    if (!mapInstanceRef.current || !enableBoundingBox) return;

    const map = mapInstanceRef.current;

    const handleMouseMove = (e: L.LeafletMouseEvent) => {
      if (!isDrawing || !drawStart) return;

      const bounds = L.latLngBounds(drawStart, e.latlng);

      if (rectangleRef.current) {
        rectangleRef.current.setBounds(bounds);
      } else {
        rectangleRef.current = L.rectangle(bounds, {
          color: "#3b82f6",
          weight: 2,
          fillOpacity: 0.2,
          fillColor: "#3b82f6",
        }).addTo(map);
      }
    };

    const handleMouseUp = (e: L.LeafletMouseEvent) => {
      if (isDrawing && drawStart) {
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

        setBoundingBox(bbox);
        onBoundingBoxChange?.(bbox);
        setDrawStart(null);
      }
    };

    map.on("mousemove", handleMouseMove);
    map.on("mouseup", handleMouseUp);

    return () => {
      map.off("mousemove", handleMouseMove);
      map.off("mouseup", handleMouseUp);
    };
  }, [isDrawing, drawStart, enableBoundingBox, onBoundingBoxChange]);

  return (
    <div className="relative h-full w-full">
      <div ref={mapRef} className="h-full w-full" />

      {/* Painel de informações do Bounding Box */}
      <div className="absolute left-4 top-4 z-[1000] rounded-lg bg-white/95 p-4 shadow-lg backdrop-blur-sm dark:bg-zinc-900/95">
        <h3 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Bounding Box
        </h3>
        <p className="mb-2 text-xs text-zinc-600 dark:text-zinc-400">
          Segure <kbd className="rounded bg-zinc-200 px-1 py-0.5 font-mono text-xs dark:bg-zinc-700">Shift</kbd> + arraste para desenhar
        </p>
        {boundingBox ? (
          <div className="space-y-1 text-xs text-zinc-700 dark:text-zinc-300">
            <p>
              <span className="font-medium">SW:</span>{" "}
              {boundingBox.southWest.lat.toFixed(4)},{" "}
              {boundingBox.southWest.lng.toFixed(4)}
            </p>
            <p>
              <span className="font-medium">NE:</span>{" "}
              {boundingBox.northEast.lat.toFixed(4)},{" "}
              {boundingBox.northEast.lng.toFixed(4)}
            </p>
            <button
              onClick={clearBoundingBox}
              className="mt-2 w-full rounded bg-red-500 px-3 py-1 text-xs text-white transition-colors hover:bg-red-600"
            >
              Limpar Seleção
            </button>
          </div>
        ) : (
          <p className="text-xs italic text-zinc-500 dark:text-zinc-500">
            Nenhuma área selecionada
          </p>
        )}
      </div>

      {/* Indicador de modo de desenho */}
      {isDrawing && (
        <div className="absolute right-4 top-4 z-[1000] rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white shadow-lg">
          Desenhando área...
        </div>
      )}
    </div>
  );
}
