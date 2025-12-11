"use client";

import { X, MapPin, Loader2, CheckCircle, AlertCircle, Download } from "lucide-react";

interface BoundingBox {
  southWest: { lat: number; lng: number };
  northEast: { lat: number; lng: number };
}

interface ProcessingModalProps {
  boundingBox: BoundingBox;
  areaKm2: number;
  onConfirm: () => void;
  onCancel: () => void;
  isProcessing: boolean;
  stages: {
    streets: "pending" | "loading" | "success" | "error";
    topography: "pending" | "loading" | "success" | "error" | "skipped";
  };
  streetCount?: number;
  errors: {
    streets?: string;
    topography?: string;
  };
  onDownloadTopography?: () => void;
}

export default function ProcessingModal({
  boundingBox,
  areaKm2,
  onConfirm,
  onCancel,
  isProcessing,
  stages,
  streetCount,
  errors,
  onDownloadTopography,
}: ProcessingModalProps) {
  const isComplete = stages.streets === "success" &&
    (stages.topography === "success" || stages.topography === "error" || stages.topography === "skipped");

  const getStageIcon = (status: string) => {
    switch (status) {
      case "loading":
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case "success":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case "skipped":
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      default:
        return <div className="h-4 w-4 rounded-full border-2 border-zinc-300" />;
    }
  };

  const getStageText = (stage: string, status: string, error?: string) => {
    if (status === "loading") return `Carregando...`;
    if (status === "success") {
      if (stage === "ruas" && streetCount) return `${streetCount} ruas`;
      return `Pronto`;
    }
    if (status === "error") return error || `Erro`;
    if (status === "skipped") return `Pulado`;
    return `Aguardando`;
  };

  return (
    <div className="absolute right-4 top-4 z-[1000] w-72 rounded-xl bg-white shadow-2xl dark:bg-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 p-3 dark:border-zinc-700">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-blue-500" />
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {isProcessing ? "Processando..." : "Confirmar Seleção"}
          </h2>
        </div>
        {!isProcessing && (
          <button
            onClick={onCancel}
            className="rounded-lg p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="p-3">
        {/* Área Info */}
        <div className="mb-3 rounded-lg bg-zinc-50 p-2 dark:bg-zinc-800/50">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-600 dark:text-zinc-400">Área</span>
            <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              {areaKm2.toFixed(1)} km²
            </span>
          </div>
        </div>

        {/* Processing Stages */}
        {isProcessing && (
          <div className="mb-3 space-y-2">
            {/* Stage 1: Streets */}
            <div className="flex items-center gap-2 rounded-lg border border-zinc-200 p-2 dark:border-zinc-700">
              {getStageIcon(stages.streets)}
              <div className="flex-1">
                <p className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                  Ruas
                </p>
                <p className="text-xs text-zinc-500">
                  {getStageText("ruas", stages.streets, errors.streets)}
                </p>
              </div>
            </div>

            {/* Stage 2: Topography */}
            <div className="flex items-center gap-2 rounded-lg border border-zinc-200 p-2 dark:border-zinc-700">
              {getStageIcon(stages.topography)}
              <div className="flex-1">
                <p className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                  Topografia
                </p>
                <p className="text-xs text-zinc-500">
                  {getStageText("topografia", stages.topography, errors.topography)}
                </p>
              </div>
              {stages.topography === "success" && onDownloadTopography && (
                <button
                  onClick={onDownloadTopography}
                  className="rounded bg-blue-500 p-1.5 text-white transition-colors hover:bg-blue-600"
                >
                  <Download className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Warning for topography error */}
        {stages.topography === "error" && stages.streets === "success" && (
          <div className="mb-3 rounded-lg bg-yellow-50 p-2 text-xs text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400">
            ⚠️ Topografia não disponível
          </div>
        )}

        {/* Footer Buttons */}
        <div className="flex gap-2">
          {!isProcessing ? (
            <>
              <button
                onClick={onCancel}
                className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancelar
              </button>
              <button
                onClick={onConfirm}
                className="flex-1 rounded-lg bg-blue-500 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-600"
              >
                Processar
              </button>
            </>
          ) : isComplete ? (
            <button
              onClick={onCancel}
              className="flex-1 rounded-lg bg-green-500 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-green-600"
            >
              ✓ Fechar
            </button>
          ) : (
            <div className="flex-1 rounded-lg bg-zinc-100 px-3 py-2 text-center text-xs font-medium text-zinc-500 dark:bg-zinc-800">
              Processando...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
