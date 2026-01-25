/**
 * Loading States e Skeletons
 *
 * Componentes de loading para o mapa
 */

'use client';

// ============ MAP LOADING ============

interface MapLoadingProps {
    message?: string;
}

export function MapLoading({ message = 'Carregando mapa...' }: MapLoadingProps) {
    return (
        <div className="flex h-full w-full flex-col items-center justify-center bg-zinc-100 dark:bg-zinc-900">
            <div className="flex flex-col items-center gap-4">
                {/* Spinner animado */}
                <div className="relative h-16 w-16">
                    <div className="absolute inset-0 animate-ping rounded-full bg-blue-400 opacity-20" />
                    <div className="absolute inset-2 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
                    <div className="absolute inset-4 flex items-center justify-center">
                        <svg
                            className="h-6 w-6 text-blue-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                            />
                        </svg>
                    </div>
                </div>

                {/* Mensagem */}
                <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                    {message}
                </p>
            </div>
        </div>
    );
}

// ============ MAP SKELETON ============

export function MapSkeleton() {
    return (
        <div className="relative h-full w-full overflow-hidden bg-zinc-200 dark:bg-zinc-800">
            {/* Grid pattern */}
            <div
                className="absolute inset-0 opacity-10"
                style={{
                    backgroundImage: `
            linear-gradient(to right, currentColor 1px, transparent 1px),
            linear-gradient(to bottom, currentColor 1px, transparent 1px)
          `,
                    backgroundSize: '40px 40px',
                }}
            />

            {/* Shimmer effect */}
            <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />

            {/* Fake controls */}
            <div className="absolute right-4 top-4 flex flex-col gap-2">
                <div className="h-8 w-8 animate-pulse rounded bg-zinc-300 dark:bg-zinc-700" />
                <div className="h-8 w-8 animate-pulse rounded bg-zinc-300 dark:bg-zinc-700" />
            </div>

            {/* Fake info panel */}
            <div className="absolute bottom-4 left-4 flex flex-col gap-2">
                <div className="h-4 w-24 animate-pulse rounded bg-zinc-300 dark:bg-zinc-700" />
                <div className="h-4 w-16 animate-pulse rounded bg-zinc-300 dark:bg-zinc-700" />
            </div>
        </div>
    );
}

// ============ PROCESSING OVERLAY ============

interface ProcessingOverlayProps {
    stage: 'streets' | 'topography' | 'nodes';
    progress?: number;
}

export function ProcessingOverlay({ stage, progress }: ProcessingOverlayProps) {
    const messages = {
        streets: 'Buscando ruas...',
        topography: 'Buscando dados de elevação...',
        nodes: 'Processando nós...',
    };

    return (
        <div className="absolute inset-0 z-[2000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="rounded-xl bg-white p-6 shadow-2xl dark:bg-zinc-800">
                <div className="flex flex-col items-center gap-4">
                    {/* Spinner */}
                    <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />

                    {/* Mensagem */}
                    <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                        {messages[stage]}
                    </p>

                    {/* Barra de progresso */}
                    {progress !== undefined && (
                        <div className="w-48">
                            <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                                <div
                                    className="h-full bg-blue-500 transition-all duration-300"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                            <p className="mt-1 text-center text-xs text-zinc-500">
                                {progress.toFixed(0)}%
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ============ NODE EDITOR SKELETON ============

export function NodeEditorSkeleton() {
    return (
        <div className="w-72 rounded-xl bg-white/95 p-4 shadow-lg backdrop-blur-sm dark:bg-zinc-800/95">
            <div className="mb-3 flex items-center justify-between">
                <div className="h-5 w-32 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
                <div className="h-5 w-5 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
            </div>

            <div className="space-y-2">
                <div className="h-4 w-full animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
                <div className="h-4 w-3/4 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
                <div className="h-4 w-1/2 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
            </div>

            <div className="mt-4 h-10 w-full animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-700" />
        </div>
    );
}

// ============ INFO PANEL SKELETON ============

export function InfoPanelSkeleton() {
    return (
        <div className="flex flex-col gap-2 rounded-lg bg-white/95 p-3 shadow-lg backdrop-blur-sm dark:bg-zinc-800/95">
            <div className="flex gap-3">
                <div className="h-8 w-16 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
                <div className="h-8 w-16 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
            </div>
            <div className="h-4 w-24 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
        </div>
    );
}
