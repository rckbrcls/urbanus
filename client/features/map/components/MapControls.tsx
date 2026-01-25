/**
 * Controles do Mapa
 *
 * Componente de controles flutuantes para o mapa
 */

'use client';

import { useMapContext } from '../context/MapContext';

interface MapControlsProps {
    position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
    showProcessButton?: boolean;
    showBackButton?: boolean;
    showEditControls?: boolean;
    className?: string;
}

export function MapControls({
    position = 'top-right',
    showProcessButton = true,
    showBackButton = true,
    showEditControls = true,
    className = '',
}: MapControlsProps) {
    const {
        viewMode,
        isProcessing,
        stages,
        activeBbox,
        nodeEditMode,
        startProcessing,
        clearBbox,
        setNodeEditMode,
        undo,
        redo,
    } = useMapContext();

    const isCropped = viewMode === 'cropped' || viewMode === 'edit';
    const canUndo = stages.streets === 'success';
    const canProcess = activeBbox && !isProcessing && stages.streets === 'pending';

    // Position classes
    const positionClasses = {
        'top-left': 'top-4 left-4',
        'top-right': 'top-4 right-4',
        'bottom-left': 'bottom-4 left-4',
        'bottom-right': 'bottom-4 right-4',
    };

    if (!isCropped) return null;

    return (
        <div className={`absolute ${positionClasses[position]} z-[1000] flex flex-col gap-2 ${className}`}>
            {/* Back Button */}
            {showBackButton && (
                <button
                    onClick={clearBbox}
                    className="flex items-center gap-2 rounded-lg bg-white/95 px-3 py-2 text-sm font-medium text-zinc-700 shadow-lg backdrop-blur-sm transition-colors hover:bg-zinc-100 dark:bg-zinc-800/95 dark:text-zinc-200 dark:hover:bg-zinc-700"
                >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    Voltar
                </button>
            )}

            {/* Process Button */}
            {showProcessButton && canProcess && (
                <button
                    onClick={startProcessing}
                    disabled={isProcessing}
                    className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-lg transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {isProcessing ? (
                        <>
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            Processando...
                        </>
                    ) : (
                        <>
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Processar Área
                        </>
                    )}
                </button>
            )}

            {/* Edit Controls */}
            {showEditControls && stages.streets === 'success' && (
                <div className="flex flex-col gap-1 rounded-lg bg-white/95 p-2 shadow-lg backdrop-blur-sm dark:bg-zinc-800/95">
                    <span className="mb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        Edição
                    </span>

                    <div className="flex gap-1">
                        <EditModeButton
                            active={nodeEditMode === 'select'}
                            onClick={() => setNodeEditMode('select')}
                            title="Selecionar"
                        >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                            </svg>
                        </EditModeButton>

                        <EditModeButton
                            active={nodeEditMode === 'move'}
                            onClick={() => setNodeEditMode('move')}
                            title="Mover"
                        >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                            </svg>
                        </EditModeButton>

                        <EditModeButton
                            active={nodeEditMode === 'delete'}
                            onClick={() => setNodeEditMode('delete')}
                            title="Deletar"
                        >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </EditModeButton>
                    </div>

                    {/* Undo/Redo */}
                    <div className="mt-1 flex gap-1 border-t border-zinc-200 pt-1 dark:border-zinc-700">
                        <button
                            onClick={undo}
                            disabled={!canUndo}
                            className="flex-1 rounded p-1.5 text-zinc-600 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-700"
                            title="Desfazer (Ctrl+Z)"
                        >
                            <svg className="mx-auto h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                            </svg>
                        </button>
                        <button
                            onClick={redo}
                            disabled={!canUndo}
                            className="flex-1 rounded p-1.5 text-zinc-600 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-700"
                            title="Refazer (Ctrl+Shift+Z)"
                        >
                            <svg className="mx-auto h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
                            </svg>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

function EditModeButton({
    active,
    onClick,
    title,
    children,
}: {
    active: boolean;
    onClick: () => void;
    title: string;
    children: React.ReactNode;
}) {
    return (
        <button
            onClick={onClick}
            title={title}
            className={`rounded p-2 transition-colors ${active
                    ? 'bg-blue-500 text-white'
                    : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-700'
                }`}
        >
            {children}
        </button>
    );
}
