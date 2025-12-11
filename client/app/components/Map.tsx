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

// Cores para diferentes tipos de vias
const HIGHWAY_COLORS: Record<string, string> = {
  motorway: "#e11d48",
  trunk: "#f97316",
  primary: "#eab308",
  secondary: "#22c55e",
  tertiary: "#3b82f6",
  residential: "#8b5cf6",
  unclassified: "#6b7280",
};

const MAX_AREA_KM2 = 100;

export default function Map({
  center = [-23.5505, -46.6333],
  zoom = 13,
  onBoundingBoxChange,
  enableBoundingBox = true,
}: MapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const rectangleRef = useRef<L.Rectangle | null>(null);
  const streetsLayerRef = useRef<L.GeoJSON | null>(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<L.LatLng | null>(null);
  const [pendingBbox, setPendingBbox] = useState<BoundingBox | null>(null);
  const [activeBbox, setActiveBbox] = useState<BoundingBox | null>(null);
  const [areaKm2, setAreaKm2] = useState(0);
  const [showCropConfirm, setShowCropConfirm] = useState(false); // Modal de confirmação de recorte
  const [isCroppedView, setIsCroppedView] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [streetCount, setStreetCount] = useState<number | undefined>(undefined);
  const [topographyBlob, setTopographyBlob] = useState<Blob | null>(null);

  const [stages, setStages] = useState<{
    streets: "pending" | "loading" | "success" | "error";
    topography: "pending" | "loading" | "success" | "error" | "skipped";
  }>({
    streets: "pending",
    topography: "pending",
  });

  const [errors, setErrors] = useState<{
    streets?: string;
    topography?: string;
  }>({});

  // Calcular área
  const calculateArea = (bbox: BoundingBox): number => {
    const latDiff = bbox.northEast.lat - bbox.southWest.lat;
    const lonDiff = bbox.northEast.lng - bbox.southWest.lng;
    const avgLat = (bbox.northEast.lat + bbox.southWest.lat) / 2;
    const kmPerDegreeLat = 111.32;
    const kmPerDegreeLon = 111.32 * Math.cos((avgLat * Math.PI) / 180);
    return Math.abs(latDiff * kmPerDegreeLat * lonDiff * kmPerDegreeLon);
  };

  // Buscar ruas
  const fetchStreets = async (bbox: BoundingBox): Promise<boolean> => {
    if (!mapInstanceRef.current) return false;

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
      setStreetCount(geojson.metadata?.totalStreets || geojson.features.length);

      // Remover camada anterior
      if (streetsLayerRef.current) {
        mapInstanceRef.current.removeLayer(streetsLayerRef.current);
      }

      // Adicionar camada GeoJSON
      streetsLayerRef.current = L.geoJSON(geojson, {
        style: (feature) => {
          const highway = feature?.properties?.highway || "unclassified";
          return {
            color: HIGHWAY_COLORS[highway] || HIGHWAY_COLORS.unclassified,
            weight: highway === "motorway" || highway === "trunk" ? 4 :
                   highway === "primary" || highway === "secondary" ? 3 : 2,
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
              <span style="color: ${HIGHWAY_COLORS[type] || "#666"}">${type}</span>
              ${props.maxspeed ? `<br/>Velocidade: ${props.maxspeed}` : ""}
              ${props.lanes ? `<br/>Faixas: ${props.lanes}` : ""}
              ${props.oneway ? "<br/>Mão única" : ""}
            `);
          }
        },
      }).addTo(mapInstanceRef.current);

      setStages((s) => ({ ...s, streets: "success" }));
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Erro desconhecido";
      setErrors((e) => ({ ...e, streets: msg }));
      setStages((s) => ({ ...s, streets: "error" }));
      return false;
    }
  };

  // Buscar topografia
  const fetchTopography = async (bbox: BoundingBox): Promise<boolean> => {
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
      const msg = error instanceof Error ? error.message : "Erro desconhecido";
      setErrors((e) => ({ ...e, topography: msg }));
      setStages((s) => ({ ...s, topography: "error" }));
      return false;
    }
  };

  // Download topografia
  const handleDownloadTopography = () => {
    if (!topographyBlob) return;
    const url = window.URL.createObjectURL(topographyBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `topografia_${Date.now()}.tif`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  // Confirmar recorte - mostra o card flutuante
  const handleConfirmCrop = () => {
    if (!pendingBbox || !mapInstanceRef.current) return;

    const map = mapInstanceRef.current;
    const bounds = L.latLngBounds(
      [pendingBbox.southWest.lat, pendingBbox.southWest.lng],
      [pendingBbox.northEast.lat, pendingBbox.northEast.lng]
    );

    // Ajustar exatamente ao bounding box
    map.fitBounds(bounds, { padding: [0, 0], animate: false });

    // Pegar o zoom atual após fitBounds
    const currentZoom = map.getZoom();

    // Travar zoom no nível atual
    map.setMinZoom(currentZoom);
    map.setMaxZoom(currentZoom);

    // Travar a área visível
    map.setMaxBounds(bounds);

    // Desabilitar TODAS as interações
    map.dragging.disable();
    map.touchZoom.disable();
    map.doubleClickZoom.disable();
    map.scrollWheelZoom.disable();
    map.boxZoom.disable();
    map.keyboard.disable();

    // Remover controles de zoom
    map.zoomControl.remove();

    // Remover o retângulo azul
    if (rectangleRef.current) {
      map.removeLayer(rectangleRef.current);
      rectangleRef.current = null;
    }

    // Salvar bbox ativo e entrar em cropped view
    setActiveBbox(pendingBbox);
    setShowCropConfirm(false);
    setPendingBbox(null);
    setIsCroppedView(true);
    onBoundingBoxChange?.(pendingBbox);
  };

  // Cancelar seleção de recorte
  const handleCancelCrop = () => {
    setShowCropConfirm(false);
    setPendingBbox(null);

    // Limpar retângulo
    if (rectangleRef.current && mapInstanceRef.current) {
      mapInstanceRef.current.removeLayer(rectangleRef.current);
      rectangleRef.current = null;
    }
  };

  // Processar dados (chamado do card flutuante)
  const handleProcessData = async () => {
    if (!activeBbox) return;

    setIsProcessing(true);
    setStages({ streets: "pending", topography: "pending" });
    setErrors({});
    setStreetCount(undefined);
    setTopographyBlob(null);

    // Etapa 1: Ruas
    const streetsOk = await fetchStreets(activeBbox);

    // Etapa 2: Topografia
    if (streetsOk) {
      await fetchTopography(activeBbox);
    } else {
      setStages((s) => ({ ...s, topography: "skipped" }));
    }

    setIsProcessing(false);
  };

  // Voltar à visualização completa
  const handleBackToFullView = () => {
    if (!mapInstanceRef.current) return;

    const map = mapInstanceRef.current;

    // Limpar camadas
    if (rectangleRef.current) {
      map.removeLayer(rectangleRef.current);
      rectangleRef.current = null;
    }
    if (streetsLayerRef.current) {
      map.removeLayer(streetsLayerRef.current);
      streetsLayerRef.current = null;
    }

    // Resetar limites de zoom e bounds
    map.setMinZoom(1);
    map.setMaxZoom(19);
    map.setMaxBounds([[-90, -180], [90, 180]]);

    // Reabilitar TODAS as interações
    map.dragging.enable();
    map.touchZoom.enable();
    map.doubleClickZoom.enable();
    map.scrollWheelZoom.enable();
    map.boxZoom.enable();
    map.keyboard.enable();

    // Readicionar controle de zoom
    L.control.zoom({ position: "topleft" }).addTo(map);

    // Resetar estado
    setActiveBbox(null);
    setStreetCount(undefined);
    setTopographyBlob(null);
    setIsCroppedView(false);

    // Voltar ao centro inicial
    map.setView(center, zoom);
    onBoundingBoxChange?.(null);
  };

  // Inicializar mapa
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      center: center,
      zoom: zoom,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    mapInstanceRef.current = map;

    if (enableBoundingBox) {
      map.on("mousedown", (e: L.LeafletMouseEvent) => {
        if (e.originalEvent.shiftKey) {
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
          setStreetCount(undefined);
          setValidationError(null);
        }
      });
    }

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [center, zoom, enableBoundingBox]);

  // Handlers de desenho
  useEffect(() => {
    if (!mapInstanceRef.current || !enableBoundingBox) return;

    const map = mapInstanceRef.current;

    const handleMouseMove = (e: L.LeafletMouseEvent) => {
      if (!isDrawing || !drawStart) return;

      const bounds = L.latLngBounds(drawStart, e.latlng);

      // Calculate area in real-time for feedback
      const southWest = { lat: bounds.getSouthWest().lat, lng: bounds.getSouthWest().lng };
      const northEast = { lat: bounds.getNorthEast().lat, lng: bounds.getNorthEast().lng };
      const currentArea = calculateArea({ southWest, northEast });
      const isTooBig = currentArea > MAX_AREA_KM2;

      if (rectangleRef.current) {
        rectangleRef.current.setBounds(bounds);
        rectangleRef.current.setStyle({
          color: isTooBig ? "#ef4444" : "#3b82f6",
          fillColor: isTooBig ? "#ef4444" : "#3b82f6",
        });
      } else {
        rectangleRef.current = L.rectangle(bounds, {
          color: isTooBig ? "#ef4444" : "#3b82f6",
          weight: 2,
          fillOpacity: 0.1,
          fillColor: isTooBig ? "#ef4444" : "#3b82f6",
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

        const area = calculateArea(bbox);
        setAreaKm2(area);
        setDrawStart(null);

        if (area > MAX_AREA_KM2) {
          // Área muito grande - mostrar erro UI em vez de alert
          setValidationError(`Área muito grande (${area.toFixed(1)} km²). Máximo: ${MAX_AREA_KM2} km²`);
          setPendingBbox(null);
          setShowCropConfirm(false);

          // Manter o retângulo vermelho por um momento ou deixá-lo lá para feedback visual
          if (rectangleRef.current) {
             rectangleRef.current.setStyle({ color: "#ef4444", fillColor: "#ef4444" });
          }
        } else {
          // Área OK - mostrar modal de confirmação de recorte
          setValidationError(null);
          setPendingBbox(bbox);
          setShowCropConfirm(true);
        }
      }
    };

    map.on("mousemove", handleMouseMove);
    map.on("mouseup", handleMouseUp);

    return () => {
      map.off("mousemove", handleMouseMove);
      map.off("mouseup", handleMouseUp);
    };
  }, [isDrawing, drawStart, enableBoundingBox]);

  // Calcular aspect ratio do bounding box para manter proporção no card
  const getAspectRatio = () => {
    if (!activeBbox) return 1;
    const latDiff = activeBbox.northEast.lat - activeBbox.southWest.lat;
    const lonDiff = activeBbox.northEast.lng - activeBbox.southWest.lng;
    const avgLat = (activeBbox.northEast.lat + activeBbox.southWest.lat) / 2;
    // Ajustar longitude pelo fator do cosseno da latitude
    const adjustedLonDiff = lonDiff * Math.cos((avgLat * Math.PI) / 180);
    return adjustedLonDiff / latDiff;
  };

  // Invalidar tamanho do mapa e reajustar bounds quando mudar para cropped view
  useEffect(() => {
    if (mapInstanceRef.current && isCroppedView && activeBbox) {
      // Pequeno delay para garantir que o DOM foi atualizado
      setTimeout(() => {
        const map = mapInstanceRef.current;
        if (!map) return;

        map.invalidateSize();

        // Reajustar bounds após redimensionar
        const bounds = L.latLngBounds(
          [activeBbox.southWest.lat, activeBbox.southWest.lng],
          [activeBbox.northEast.lat, activeBbox.northEast.lng]
        );
        map.fitBounds(bounds, { padding: [0, 0], animate: false });
      }, 150);
    }
  }, [isCroppedView, activeBbox]);

  return (
    <div className="relative h-full w-full">
      {/* Backdrop escuro quando em cropped view */}
      {isCroppedView && (
        <div className="absolute inset-0 z-[900] flex items-center justify-center bg-zinc-100 dark:bg-zinc-950">
          {/* Este é apenas o backdrop, o mapa será posicionado por cima */}
        </div>
      )}

      {/* Container do mapa - sempre renderizado, apenas muda estilo */}
      <div
        className={
          isCroppedView
            ? "absolute left-1/2 top-1/2 z-[901] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl shadow-2xl ring-1 ring-zinc-200 dark:ring-zinc-800"
            : "h-full w-full"
        }
        style={
          isCroppedView
            ? {
                aspectRatio: getAspectRatio(),
                maxWidth: 'min(90vw, 900px)',
                maxHeight: 'min(80vh, 700px)',
                width: getAspectRatio() > 1 ? 'min(90vw, 900px)' : 'auto',
                height: getAspectRatio() <= 1 ? 'min(80vh, 700px)' : 'auto',
              }
            : undefined
        }
      >
        <div ref={mapRef} className="h-full w-full" />
      </div>

      {/* Controles do cropped view */}
      {isCroppedView && (
        <>
          <div className="absolute left-1/2 top-1/2 z-[1000] -translate-x-1/2 -translate-y-1/2"
            style={{
              width: getAspectRatio() > 1 ? 'min(90vw, 900px)' : 'auto',
              height: getAspectRatio() <= 1 ? 'min(80vh, 700px)' : 'auto',
              aspectRatio: getAspectRatio(),
              maxWidth: 'min(90vw, 900px)',
              maxHeight: 'min(80vh, 700px)',
              pointerEvents: 'none',
            }}
          >
            {/* Controles sobre o card */}
            <div className="absolute left-3 top-3 flex items-center gap-2" style={{ pointerEvents: 'auto' }}>
              <button
                onClick={handleBackToFullView}
                className="flex items-center gap-2 rounded-lg bg-white/95 px-3 py-1.5 text-sm font-medium text-zinc-800 shadow-md backdrop-blur-sm transition-all hover:bg-white dark:bg-zinc-800/95 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                ← Voltar
              </button>
              <span className="rounded-lg bg-white/95 px-2 py-1 text-xs text-zinc-600 shadow-md backdrop-blur-sm dark:bg-zinc-800/95 dark:text-zinc-400">
                {areaKm2.toFixed(1)} km²
              </span>
              {/* Botão para processar dados */}
              {!isProcessing && stages.streets === "pending" && (
                <button
                  onClick={handleProcessData}
                  className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-md transition-all hover:bg-blue-700"
                >
                  Processar dados
                </button>
              )}
              {isProcessing && (
                <span className="flex items-center gap-2 rounded-lg bg-blue-600/80 px-3 py-1.5 text-sm font-medium text-white shadow-md">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Processando...
                </span>
              )}
              {stages.streets === "success" && (
                <span className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white shadow-md">
                  ✓ Processado
                </span>
              )}
            </div>

            {/* Legenda de cores dentro do card */}
            {streetCount !== undefined && (
              <div className="absolute bottom-3 left-3 rounded-lg bg-white/95 p-2.5 shadow-md backdrop-blur-sm dark:bg-zinc-800/95" style={{ pointerEvents: 'auto' }}>
                <p className="mb-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  {streetCount} ruas
                </p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
                  {Object.entries(HIGHWAY_COLORS).map(([type, color]) => (
                    <div key={type} className="flex items-center gap-1">
                      <div className="h-1.5 w-3 rounded-sm" style={{ backgroundColor: color }} />
                      <span className="text-zinc-600 dark:text-zinc-400">{type}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* UI normal quando não está em cropped view */}
      {!isCroppedView && (
        <>
          {/* Instrução de uso */}
          <div className="absolute left-4 top-4 z-[1000] rounded-lg bg-white/95 px-3 py-2 shadow-lg backdrop-blur-sm dark:bg-zinc-900/95">
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              <kbd className="rounded bg-zinc-200 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-700">Shift</kbd> + arraste para selecionar (máx {MAX_AREA_KM2} km²)
            </p>
          </div>

          {/* Indicador de desenho */}
          {isDrawing && (
            <div className="absolute left-4 top-14 z-[1000] rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white shadow-lg">
              Desenhando área...
            </div>
          )}

          {/* Legenda de cores */}
          {streetCount !== undefined && (
            <div className="absolute bottom-4 left-4 z-[1000] rounded-lg bg-white/95 p-3 shadow-lg backdrop-blur-sm dark:bg-zinc-900/95">
              <p className="mb-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                {streetCount} ruas carregadas
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                {Object.entries(HIGHWAY_COLORS).map(([type, color]) => (
                  <div key={type} className="flex items-center gap-1.5">
                    <div className="h-2 w-4 rounded" style={{ backgroundColor: color }} />
                    <span className="text-zinc-600 dark:text-zinc-400">{type}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Mensagem de Erro de Validação */}
      {validationError && !isCroppedView && (
        <div className="absolute left-1/2 top-20 z-[1100] -translate-x-1/2 rounded-lg bg-red-500/95 px-4 py-2 text-sm font-medium text-white shadow-lg backdrop-blur-sm animate-in fade-in slide-in-from-top-4">
          ⚠️ {validationError}
        </div>
      )}

      {/* Modal de confirmação de recorte - flutuante na direita */}
      {showCropConfirm && pendingBbox && (
        <div className="absolute right-4 top-4 z-[2000] w-80 rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
          <h3 className="mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Recortar área?
          </h3>

          <div className="mb-4 space-y-2 text-xs">
            <p className="text-zinc-600 dark:text-zinc-400">
              Área: <strong className="text-zinc-900 dark:text-zinc-100">{areaKm2.toFixed(2)} km²</strong>
            </p>
            <div className="rounded-lg bg-zinc-100 p-2 font-mono text-[10px] dark:bg-zinc-800">
              <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                <span className="text-zinc-500">Norte:</span>
                <span className="text-zinc-700 dark:text-zinc-300">{pendingBbox.northEast.lat.toFixed(6)}°</span>
                <span className="text-zinc-500">Sul:</span>
                <span className="text-zinc-700 dark:text-zinc-300">{pendingBbox.southWest.lat.toFixed(6)}°</span>
                <span className="text-zinc-500">Leste:</span>
                <span className="text-zinc-700 dark:text-zinc-300">{pendingBbox.northEast.lng.toFixed(6)}°</span>
                <span className="text-zinc-500">Oeste:</span>
                <span className="text-zinc-700 dark:text-zinc-300">{pendingBbox.southWest.lng.toFixed(6)}°</span>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleCancelCrop}
              className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirmCrop}
              className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              Recortar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
