/**
 * Legenda de Elevação
 *
 * Exibe gradiente de cores para elevação
 */

'use client';

import type { ElevationStats } from '../types/elevation.types';

interface ElevationLegendProps {
    stats: ElevationStats | null;
    visible?: boolean;
}

export function ElevationLegend({ stats, visible = true }: ElevationLegendProps) {
    if (!visible || !stats || stats.min === null || stats.max === null) {
        return null;
    }

    return (
        <div className="rounded-lg bg-white/95 p-3 shadow-md backdrop-blur-sm dark:bg-zinc-800/95">
            <h4 className="mb-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Elevação
            </h4>

            {/* Gradiente */}
            <div
                className="mb-2 h-3 w-full rounded"
                style={{
                    background:
                        'linear-gradient(to right, #22c55e, #eab308, #ef4444)',
                }}
            />

            {/* Valores */}
            <div className="flex justify-between text-[10px] text-zinc-500 dark:text-zinc-400">
                <span>{stats.min.toFixed(0)}m</span>
                {stats.avg !== null && (
                    <span>Média: {stats.avg.toFixed(0)}m</span>
                )}
                <span>{stats.max.toFixed(0)}m</span>
            </div>
        </div>
    );
}
