/**
 * Painel de Informações do Mapa
 *
 * Exibe informações contextuais sobre a área selecionada e dados
 */

'use client';

import { useMemo } from 'react';
import { useMapContext } from '../context/MapContext';

interface MapInfoPanelProps {
    position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
    showArea?: boolean;
    showStreetCount?: boolean;
    showNodeCount?: boolean;
    showElevation?: boolean;
    className?: string;
}

export function MapInfoPanel({
    position = 'bottom-left',
    showArea = true,
    showStreetCount = true,
    showNodeCount = true,
    showElevation = true,
    className = '',
}: MapInfoPanelProps) {
    const {
        viewMode,
        bboxArea,
        streetCount,
        nodes,
        stages,
        isProcessing,
    } = useMapContext();

    const isCropped = viewMode === 'cropped' || viewMode === 'edit';

    // Estatísticas de nós
    const nodeStats = useMemo(() => {
        if (nodes.length === 0) return null;

        return {
            total: nodes.length,
            endpoints: nodes.filter((n) => n.isEndpoint).length,
            selected: nodes.filter((n) => n.isSelected).length,
        };
    }, [nodes]);

    // Estatísticas de elevação (a partir dos nós)
    const elevationStats = useMemo(() => {
        const elevations = nodes
            .map((n) => n.elevation)
            .filter((e): e is number => e !== null);
        if (elevations.length === 0) return null;
        return {
            min: Math.min(...elevations),
            max: Math.max(...elevations),
            avg: elevations.reduce((a, b) => a + b, 0) / elevations.length,
        };
    }, [nodes]);

    // Position classes
    const positionClasses = {
        'top-left': 'top-4 left-4',
        'top-right': 'top-4 right-4',
        'bottom-left': 'bottom-4 left-4',
        'bottom-right': 'bottom-4 right-4',
    };

    if (!isCropped) return null;

    return (
        <div className={`absolute ${positionClasses[position]} z-[1000] ${className}`}>
            <div className="flex flex-col gap-2 rounded-lg bg-white/95 p-3 shadow-lg backdrop-blur-sm dark:bg-zinc-800/95">
                {/* Processando */}
                {isProcessing && (
                    <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                        {stages.streets === 'loading' && 'Buscando ruas...'}
                        {stages.topography === 'loading' && 'Buscando topografia...'}
                    </div>
                )}

                {/* Área */}
                {showArea && bboxArea > 0 && (
                    <InfoItem label="Área" value={`${bboxArea.toFixed(2)} km²`} />
                )}

                {/* Ruas */}
                {showStreetCount && stages.streets === 'success' && (
                    <InfoItem label="Ruas" value={streetCount.toString()} />
                )}

                {/* Nós */}
                {showNodeCount && nodeStats && (
                    <div className="flex gap-3">
                        <InfoItem label="Nós" value={nodeStats.total.toString()} />
                        <InfoItem label="Endpoints" value={nodeStats.endpoints.toString()} />
                        {nodeStats.selected > 0 && (
                            <InfoItem label="Selecionados" value={nodeStats.selected.toString()} highlight />
                        )}
                    </div>
                )}

                {/* Elevação */}
                {showElevation && elevationStats && (
                    <div className="border-t border-zinc-200 pt-2 dark:border-zinc-700">
                        <div className="mb-1 text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
                            Elevação
                        </div>
                        <div className="flex gap-3">
                            <InfoItem label="Min" value={`${elevationStats.min.toFixed(0)}m`} />
                            <InfoItem label="Média" value={`${elevationStats.avg.toFixed(0)}m`} />
                            <InfoItem label="Max" value={`${elevationStats.max.toFixed(0)}m`} />
                        </div>
                    </div>
                )}

                {/* Status de processamento */}
                {stages.streets === 'error' && (
                    <div className="text-xs text-red-500">Erro ao buscar ruas</div>
                )}
                {stages.topography === 'error' && (
                    <div className="text-xs text-amber-500">Elevação indisponível</div>
                )}
            </div>
        </div>
    );
}

function InfoItem({
    label,
    value,
    highlight = false,
}: {
    label: string;
    value: string;
    highlight?: boolean;
}) {
    return (
        <div className="flex flex-col">
            <span className="text-[10px] text-zinc-500 dark:text-zinc-400">{label}</span>
            <span
                className={`text-sm font-medium ${highlight
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-zinc-900 dark:text-zinc-100'
                    }`}
            >
                {value}
            </span>
        </div>
    );
}
