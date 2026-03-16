"use client";

import { useState } from "react";
import { Download, Loader2, Mountain, AlertCircle, X } from "lucide-react";

interface BoundingBox {
  southWest: { lat: number; lng: number };
  northEast: { lat: number; lng: number };
}

interface TopographyPanelProps {
  boundingBox: BoundingBox | null;
  onClose?: () => void;
}

const DEM_OPTIONS = [
  { value: "COP30", label: "Copernicus 30m", description: "Alta resolução global" },
  { value: "COP90", label: "Copernicus 90m", description: "Média resolução global" },
  { value: "SRTMGL1", label: "SRTM 30m", description: "NASA/USGS" },
  { value: "SRTMGL3", label: "SRTM 90m", description: "NASA/USGS" },
  { value: "NASADEM", label: "NASADEM", description: "NASA reprocessado" },
  { value: "AW3D30", label: "ALOS 30m", description: "Japão JAXA" },
] as const;

type DemType = (typeof DEM_OPTIONS)[number]["value"];

type DownloadStatus = "idle" | "loading" | "success" | "error";

export default function TopographyPanel({ boundingBox, onClose }: TopographyPanelProps) {
  const [demType, setDemType] = useState<DemType>("COP30");
  const [status, setStatus] = useState<DownloadStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [areaKm2, setAreaKm2] = useState<number | null>(null);

  // Calcular área quando bbox muda
  const calculateArea = (bbox: BoundingBox): number => {
    const latDiff = bbox.northEast.lat - bbox.southWest.lat;
    const lonDiff = bbox.northEast.lng - bbox.southWest.lng;
    const avgLat = (bbox.northEast.lat + bbox.southWest.lat) / 2;
    const kmPerDegreeLat = 111.32;
    const kmPerDegreeLon = 111.32 * Math.cos((avgLat * Math.PI) / 180);
    return Math.abs(latDiff * kmPerDegreeLat * lonDiff * kmPerDegreeLon);
  };

  const handleDownload = async () => {
    if (!boundingBox) return;

    setStatus("loading");
    setError(null);

    try {
      const response = await fetch("/api/topography", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          south: boundingBox.southWest.lat,
          north: boundingBox.northEast.lat,
          west: boundingBox.southWest.lng,
          east: boundingBox.northEast.lng,
          demType: demType,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Erro ao buscar dados");
      }

      // Baixar o arquivo
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `topografia_${demType}_${Date.now()}.tif`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setStatus("success");
      setTimeout(() => setStatus("idle"), 3000);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    }
  };

  const currentArea = boundingBox ? calculateArea(boundingBox) : 0;
  const isAreaTooLarge = currentArea > 500;

  return (
    <div className="absolute right-4 top-4 z-[1000] w-80 rounded-xl bg-white/95 shadow-2xl backdrop-blur-sm dark:bg-zinc-900/95">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 p-4 dark:border-zinc-700">
        <div className="flex items-center gap-2">
          <Mountain className="h-5 w-5 text-blue-500" />
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
            Topografia
          </h3>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        {!boundingBox ? (
          <div className="rounded-lg bg-zinc-100 p-4 text-center dark:bg-zinc-800">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Segure <kbd className="rounded bg-zinc-200 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-700">Shift</kbd> e arraste no mapa para selecionar uma área
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Coordenadas */}
            <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/50">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                Área Selecionada
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-zinc-500">SW:</span>{" "}
                  <span className="font-mono text-zinc-700 dark:text-zinc-300">
                    {boundingBox.southWest.lat.toFixed(4)}, {boundingBox.southWest.lng.toFixed(4)}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500">NE:</span>{" "}
                  <span className="font-mono text-zinc-700 dark:text-zinc-300">
                    {boundingBox.northEast.lat.toFixed(4)}, {boundingBox.northEast.lng.toFixed(4)}
                  </span>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-1">
                <span className={`text-xs font-medium ${isAreaTooLarge ? "text-red-500" : "text-zinc-600 dark:text-zinc-400"}`}>
                  ~{currentArea.toFixed(1)} km²
                </span>
                {isAreaTooLarge && (
                  <span className="text-xs text-red-500">(máx: 500 km²)</span>
                )}
              </div>
            </div>

            {/* Seletor de DEM */}
            <div>
              <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-zinc-500">
                Tipo de Dados
              </label>
              <select
                value={demType}
                onChange={(e) => setDemType(e.target.value as DemType)}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              >
                {DEM_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} - {option.description}
                  </option>
                ))}
              </select>
            </div>

            {/* Erro */}
            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Sucesso */}
            {status === "success" && (
              <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
                ✓ Download iniciado com sucesso!
              </div>
            )}

            {/* Botão de Download */}
            <button
              onClick={handleDownload}
              disabled={status === "loading" || isAreaTooLarge}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 py-3 font-medium text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-500 dark:disabled:bg-zinc-700"
            >
              {status === "loading" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Buscando dados...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Baixar GeoTIFF
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
