/**
 * Barra de Status do Mapa
 *
 * Exibe informações sobre processamento, erros e estatísticas
 */

'use client';

import type { ProcessingStages, ProcessingErrors } from '../types';

interface MapStatusBarProps {
    isProcessing: boolean;
    stages: ProcessingStages;
    errors: ProcessingErrors;
    streetCount?: number;
    nodeCount?: number;
    areaKm2?: number;
}

export function MapStatusBar({
    isProcessing,
    stages,
    errors,
    streetCount,
    nodeCount,
    areaKm2,
}: MapStatusBarProps) {
    const hasError = stages.streets === 'error' || stages.topography === 'error' || stages.nodes === 'error';
    const isComplete = stages.streets === 'success' && stages.topography === 'success' && stages.nodes === 'success';

    return (
        <div className="flex items-center gap-3">
            {/* Área */}
            {areaKm2 !== undefined && (
                <span className="rounded-lg bg-white/95 px-2 py-1 text-xs text-zinc-600 shadow-md backdrop-blur-sm dark:bg-zinc-800/95 dark:text-zinc-400">
                    {areaKm2.toFixed(1)} km²
                </span>
            )}

            {/* Processando */}
            {isProcessing && (
                <span className="flex items-center gap-2 rounded-lg bg-blue-600/80 px-3 py-1.5 text-xs font-medium text-white shadow-md">
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    {stages.streets === 'loading' && 'Buscando ruas...'}
                    {stages.topography === 'loading' && 'Buscando topografia...'}
                    {stages.nodes === 'loading' && 'Extraindo nós...'}
                </span>
            )}

            {/* Sucesso */}
            {isComplete && !isProcessing && (
                <span className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white shadow-md">
                    ✓ Processado
                </span>
            )}

            {/* Estatísticas */}
            {streetCount !== undefined && !isProcessing && (
                <span className="rounded-lg bg-white/95 px-2 py-1 text-xs text-zinc-600 shadow-md backdrop-blur-sm dark:bg-zinc-800/95 dark:text-zinc-400">
                    {streetCount} ruas
                </span>
            )}

            {nodeCount !== undefined && nodeCount > 0 && !isProcessing && (
                <span className="rounded-lg bg-white/95 px-2 py-1 text-xs text-zinc-600 shadow-md backdrop-blur-sm dark:bg-zinc-800/95 dark:text-zinc-400">
                    {nodeCount} nós
                </span>
            )}

            {/* Erros */}
            {hasError && (
                <div className="flex flex-col gap-1">
                    {stages.streets === 'error' && (
                        <span className="flex items-center gap-2 rounded-lg bg-red-500/95 px-3 py-1.5 text-xs font-medium text-white shadow-md backdrop-blur-sm">
                            ⚠️ Ruas: {errors.streets || 'Falha'}
                        </span>
                    )}
                    {stages.topography === 'error' && (
                        <span className="flex items-center gap-2 rounded-lg bg-red-500/95 px-3 py-1.5 text-xs font-medium text-white shadow-md backdrop-blur-sm">
                            ⚠️ Topografia: {errors.topography || 'Falha'}
                        </span>
                    )}
                    {stages.nodes === 'error' && (
                        <span className="flex items-center gap-2 rounded-lg bg-red-500/95 px-3 py-1.5 text-xs font-medium text-white shadow-md backdrop-blur-sm">
                            ⚠️ Nós: {errors.nodes || 'Falha'}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}
