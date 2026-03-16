/**
 * Editor de Nó
 *
 * Painel de informações e ações para nós selecionados
 */

'use client';

import { useMemo } from 'react';
import type { MapNode, NodeEditMode } from '../types';

interface NodeEditorProps {
    selectedNodes: MapNode[];
    editMode: NodeEditMode;
    onSetEditMode: (mode: NodeEditMode) => void;
    onClearSelection: () => void;
    onDelete: () => void;
    onUndo: () => void;
    onRedo: () => void;
    onLock: () => void;
    onUnlock: () => void;
    canUndo: boolean;
    canRedo: boolean;
    error?: { message: string } | null;
}

export function NodeEditor({
    selectedNodes,
    editMode,
    onSetEditMode,
    onClearSelection,
    onDelete,
    onUndo,
    onRedo,
    onLock,
    onUnlock,
    canUndo,
    canRedo,
    error,
}: NodeEditorProps) {
    const selectedCount = selectedNodes.length;
    const selectedNode = selectedCount === 1 ? selectedNodes[0] : null;

    // Estatísticas da seleção
    const selectionStats = useMemo(() => {
        if (selectedCount === 0) return null;

        const endpoints = selectedNodes.filter((n) => n.isEndpoint).length;
        const locked = selectedNodes.filter((n) => n.isLocked).length;
        const deletable = selectedNodes.filter((n) => !n.isEndpoint && !n.isLocked).length;

        const elevations = selectedNodes
            .map((n) => n.elevation)
            .filter((e): e is number => e !== null);

        return {
            endpoints,
            locked,
            deletable,
            avgElevation: elevations.length > 0
                ? elevations.reduce((a, b) => a + b, 0) / elevations.length
                : null,
        };
    }, [selectedNodes, selectedCount]);

    // Estado vazio - instrução para usuário
    if (selectedCount === 0) {
        return (
            <div className="w-72 rounded-xl bg-white/95 p-4 shadow-lg backdrop-blur-sm dark:bg-zinc-800/95">
                <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Editor de Nós
                </h3>

                {/* Modo de edição */}
                <div className="mb-4">
                    <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
                        Modo de edição:
                    </p>
                    <div className="flex gap-1">
                        <ModeButton
                            active={editMode === 'select'}
                            onClick={() => onSetEditMode('select')}
                            icon="pointer"
                            tooltip="Selecionar"
                        />
                        <ModeButton
                            active={editMode === 'move'}
                            onClick={() => onSetEditMode('move')}
                            icon="move"
                            tooltip="Mover"
                        />
                        <ModeButton
                            active={editMode === 'delete'}
                            onClick={() => onSetEditMode('delete')}
                            icon="trash"
                            tooltip="Deletar"
                        />
                        <ModeButton
                            active={editMode === 'add'}
                            onClick={() => onSetEditMode('add')}
                            icon="plus"
                            tooltip="Adicionar"
                        />
                    </div>
                </div>

                <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
                    Clique em um nó para selecioná-lo.
                    <br />
                    <span className="text-[10px]">
                        Shift+Click para adicionar à seleção
                    </span>
                </p>

                {/* Undo/Redo */}
                <div className="mt-4 flex justify-center gap-2">
                    <ActionButton
                        onClick={onUndo}
                        disabled={!canUndo}
                        icon="undo"
                        tooltip="Desfazer (Ctrl+Z)"
                    />
                    <ActionButton
                        onClick={onRedo}
                        disabled={!canRedo}
                        icon="redo"
                        tooltip="Refazer (Ctrl+Shift+Z)"
                    />
                </div>
            </div>
        );
    }

    // Seleção múltipla
    if (selectedCount > 1) {
        return (
            <div className="w-72 rounded-xl bg-white/95 p-4 shadow-lg backdrop-blur-sm dark:bg-zinc-800/95">
                <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {selectedCount} nós selecionados
                    </h3>
                    <button
                        onClick={onClearSelection}
                        className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
                        title="Limpar seleção (Esc)"
                    >
                        <XIcon />
                    </button>
                </div>

                {/* Estatísticas */}
                {selectionStats && (
                    <div className="mb-4 grid grid-cols-2 gap-2 text-xs">
                        <StatItem label="Endpoints" value={selectionStats.endpoints} />
                        <StatItem label="Bloqueados" value={selectionStats.locked} />
                        <StatItem label="Deletáveis" value={selectionStats.deletable} />
                        {selectionStats.avgElevation !== null && (
                            <StatItem
                                label="Elev. média"
                                value={`${selectionStats.avgElevation.toFixed(1)}m`}
                            />
                        )}
                    </div>
                )}

                {/* Ações em lote */}
                <div className="flex flex-col gap-2">
                    <button
                        onClick={onDelete}
                        disabled={selectionStats?.deletable === 0}
                        className="flex w-full items-center justify-start gap-2 rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
                    >
                        <TrashIcon />
                        Deletar selecionados ({selectionStats?.deletable})
                    </button>

                    <div className="flex gap-2">
                        <button
                            onClick={onLock}
                            disabled={selectionStats?.locked === selectedCount}
                            className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-zinc-200 px-2 py-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-700"
                        >
                            🔒 Bloquear
                        </button>
                        <button
                            onClick={onUnlock}
                            disabled={selectionStats?.locked === 0}
                            className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-zinc-200 px-2 py-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-700"
                        >
                            🔓 Desbloquear
                        </button>
                    </div>
                </div>

                {/* Undo/Redo */}
                <div className="mt-4 flex justify-center gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-700">
                    <ActionButton onClick={onUndo} disabled={!canUndo} icon="undo" tooltip="Desfazer" />
                    <ActionButton onClick={onRedo} disabled={!canRedo} icon="redo" tooltip="Refazer" />
                </div>

                {error && <ErrorMessage message={error.message} />}
            </div>
        );
    }

    // Seleção única
    return (
        <div className="w-72 rounded-xl bg-white/95 p-4 shadow-lg backdrop-blur-sm dark:bg-zinc-800/95">
            {/* Header */}
            <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Detalhes do Nó
                </h3>
                <button
                    onClick={onClearSelection}
                    className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
                >
                    <XIcon />
                </button>
            </div>

            {/* Informações do nó */}
            <div className="mb-4 space-y-2 text-xs">
                <InfoRow label="Latitude" value={selectedNode!.position.lat.toFixed(6)} mono />
                <InfoRow label="Longitude" value={selectedNode!.position.lng.toFixed(6)} mono />

                {selectedNode!.elevation !== null && (
                    <InfoRow label="Elevação" value={`${selectedNode!.elevation.toFixed(1)}m`} />
                )}

                {selectedNode!.streetName && (
                    <InfoRow label="Rua" value={selectedNode!.streetName} />
                )}

                <div className="flex flex-wrap gap-1 pt-1">
                    {selectedNode!.isEndpoint && (
                        <Badge color="amber">Endpoint</Badge>
                    )}
                    {selectedNode!.isIntersection && (
                        <Badge color="blue">Interseção</Badge>
                    )}
                    {selectedNode!.isLocked && (
                        <Badge color="gray">🔒 Bloqueado</Badge>
                    )}
                </div>
            </div>

            {/* Ações */}
            <div className="flex flex-col gap-2">
                <button
                    onClick={onDelete}
                    disabled={selectedNode!.isEndpoint || selectedNode!.isLocked}
                    className="flex w-full items-center justify-start gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-red-400 dark:hover:bg-red-900/20"
                >
                    <TrashIcon />
                    Deletar nó
                </button>

                <button
                    onClick={selectedNode!.isLocked ? onUnlock : onLock}
                    className="flex w-full items-center justify-start gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-700"
                >
                    {selectedNode!.isLocked ? '🔓 Desbloquear' : '🔒 Bloquear'}
                </button>
            </div>

            {/* Aviso para endpoints */}
            {selectedNode!.isEndpoint && (
                <p className="mt-3 text-[10px] text-zinc-500 dark:text-zinc-400">
                    Endpoints não podem ser deletados pois são necessários para definir a
                    geometria da rua.
                </p>
            )}

            {/* Undo/Redo */}
            <div className="mt-4 flex justify-center gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-700">
                <ActionButton onClick={onUndo} disabled={!canUndo} icon="undo" tooltip="Desfazer" />
                <ActionButton onClick={onRedo} disabled={!canRedo} icon="redo" tooltip="Refazer" />
            </div>

            {error && <ErrorMessage message={error.message} />}
        </div>
    );
}

// ============ SUB-COMPONENTS ============

function ModeButton({
    active,
    onClick,
    icon,
    tooltip,
}: {
    active: boolean;
    onClick: () => void;
    icon: 'pointer' | 'move' | 'trash' | 'plus';
    tooltip: string;
}) {
    const icons = {
        pointer: (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
            </svg>
        ),
        move: (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
        ),
        trash: (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
        ),
        plus: (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
        ),
    };

    return (
        <button
            onClick={onClick}
            title={tooltip}
            className={`flex-1 rounded-lg p-2 transition-colors ${active
                    ? 'bg-blue-500 text-white'
                    : 'border border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-700'
                }`}
        >
            {icons[icon]}
        </button>
    );
}

function ActionButton({
    onClick,
    disabled,
    icon,
    tooltip,
}: {
    onClick: () => void;
    disabled: boolean;
    icon: 'undo' | 'redo';
    tooltip: string;
}) {
    const icons = {
        undo: (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
        ),
        redo: (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
            </svg>
        ),
    };

    return (
        <button
            onClick={onClick}
            disabled={disabled}
            title={tooltip}
            className="rounded-lg border border-zinc-200 p-2 text-zinc-600 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-700"
        >
            {icons[icon]}
        </button>
    );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
    return (
        <div className="flex justify-between">
            <span className="text-zinc-500 dark:text-zinc-400">{label}:</span>
            <span className={`text-zinc-900 dark:text-zinc-100 ${mono ? 'font-mono' : ''}`}>
                {value}
            </span>
        </div>
    );
}

function StatItem({ label, value }: { label: string; value: number | string }) {
    return (
        <div className="rounded-lg bg-zinc-100 p-2 dark:bg-zinc-700">
            <div className="text-[10px] text-zinc-500 dark:text-zinc-400">{label}</div>
            <div className="font-medium text-zinc-900 dark:text-zinc-100">{value}</div>
        </div>
    );
}

function Badge({ color, children }: { color: 'amber' | 'blue' | 'gray'; children: React.ReactNode }) {
    const colors = {
        amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
        blue: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
        gray: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400',
    };

    return (
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${colors[color]}`}>
            {children}
        </span>
    );
}

function ErrorMessage({ message }: { message: string }) {
    return (
        <div className="mt-3 rounded-lg bg-red-50 p-2 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {message}
        </div>
    );
}

function XIcon() {
    return (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
    );
}

function TrashIcon() {
    return (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
    );
}
