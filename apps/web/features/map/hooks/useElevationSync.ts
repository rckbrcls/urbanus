/**
 * Hook de Sincronização de Elevação
 *
 * Gerencia recálculo lazy de elevação para nós modificados.
 * Apenas recalcula elevação quando necessário (ao salvar/exportar),
 * melhorando performance durante operações de edição.
 */

import { useState, useCallback, useRef, useMemo } from 'react';
import { ElevationService } from '../services/ElevationService';
import type { MapNode } from '../types';

interface UseElevationSyncOptions {
    /**
     * Elevation data for lookup (client-side lookup removed; server enriches only).
     * Pass null to skip sync; hook no-ops when null.
     */
    elevationData: unknown | null;
    /**
     * Se deve usar interpolação bilinear
     */
    interpolate?: boolean;
    /**
     * Callback quando elevações são sincronizadas
     */
    onSync?: (syncedNodes: MapNode[]) => void;
}

interface UseElevationSyncReturn {
    /**
     * IDs dos nós que foram modificados e precisam de sync
     */
    modifiedNodeIds: Set<string>;

    /**
     * Marca um nó como modificado (precisa recalcular elevação)
     */
    markModified: (nodeId: string) => void;

    /**
     * Marca múltiplos nós como modificados
     */
    markModifiedBatch: (nodeIds: string[]) => void;

    /**
     * Remove um nó da lista de modificados
     */
    clearModified: (nodeId: string) => void;

    /**
     * Limpa todos os nós modificados
     */
    clearAllModified: () => void;

    /**
     * Sincroniza elevações de todos os nós modificados
     * Retorna os nós com elevações atualizadas
     */
    syncElevations: (nodes: MapNode[]) => Promise<MapNode[]>;

    /**
     * Sincroniza elevação de um único nó
     */
    syncNodeElevation: (node: MapNode) => MapNode;

    /**
     * Verifica se um nó precisa de sync
     */
    needsSync: (nodeId: string) => boolean;

    /**
     * Número de nós pendentes de sync
     */
    pendingCount: number;

    /**
     * Se há nós pendentes de sync
     */
    hasPending: boolean;
}

export function useElevationSync(
    options: UseElevationSyncOptions
): UseElevationSyncReturn {
    const { elevationData, interpolate = false, onSync } = options;

    const service = ElevationService.getInstance();

    // Track modified node IDs
    const [modifiedNodeIds, setModifiedNodeIds] = useState<Set<string>>(new Set());

    // Ref for batch operations
    const batchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const pendingBatchRef = useRef<string[]>([]);

    /**
     * Mark a single node as modified
     */
    const markModified = useCallback((nodeId: string) => {
        setModifiedNodeIds((prev) => {
            const next = new Set(prev);
            next.add(nodeId);
            return next;
        });
    }, []);

    /**
     * Mark multiple nodes as modified
     */
    const markModifiedBatch = useCallback((nodeIds: string[]) => {
        setModifiedNodeIds((prev) => {
            const next = new Set(prev);
            nodeIds.forEach((id) => next.add(id));
            return next;
        });
    }, []);

    /**
     * Clear a node from modified list
     */
    const clearModified = useCallback((nodeId: string) => {
        setModifiedNodeIds((prev) => {
            const next = new Set(prev);
            next.delete(nodeId);
            return next;
        });
    }, []);

    /**
     * Clear all modified nodes
     */
    const clearAllModified = useCallback(() => {
        setModifiedNodeIds(new Set());
    }, []);

    /**
     * Check if a node needs sync
     */
    const needsSync = useCallback(
        (nodeId: string) => modifiedNodeIds.has(nodeId),
        [modifiedNodeIds]
    );

    /**
     * Sync elevation for a single node
     */
    const syncNodeElevation = useCallback(
        (node: MapNode): MapNode => {
            if (!elevationData) return node;

            const elevation = service.getElevationAtPoint(
                elevationData,
                node.position.lat,
                node.position.lng,
                interpolate
            );

            return {
                ...node,
                elevation,
                updatedAt: Date.now(),
            };
        },
        [elevationData, service, interpolate]
    );

    /**
     * Sync elevations for all modified nodes
     */
    const syncElevations = useCallback(
        async (nodes: MapNode[]): Promise<MapNode[]> => {
            if (!elevationData || modifiedNodeIds.size === 0) {
                return nodes;
            }

            const syncedNodes = nodes.map((node) => {
                // Only recalculate for modified nodes
                if (!modifiedNodeIds.has(node.id)) {
                    return node;
                }

                return syncNodeElevation(node);
            });

            // Clear all modified after sync
            clearAllModified();

            // Callback
            onSync?.(syncedNodes);

            return syncedNodes;
        },
        [elevationData, modifiedNodeIds, syncNodeElevation, clearAllModified, onSync]
    );

    /**
     * Computed values
     */
    const pendingCount = useMemo(() => modifiedNodeIds.size, [modifiedNodeIds]);
    const hasPending = useMemo(() => modifiedNodeIds.size > 0, [modifiedNodeIds]);

    return {
        modifiedNodeIds,
        markModified,
        markModifiedBatch,
        clearModified,
        clearAllModified,
        syncElevations,
        syncNodeElevation,
        needsSync,
        pendingCount,
        hasPending,
    };
}

/**
 * Hook para sincronização automática de elevação após drag
 *
 * Uso típico:
 * ```typescript
 * const { markModified, syncElevations } = useElevationSync({ elevationData });
 *
 * // Durante drag
 * const handleDragEnd = async (nodeId: string, newPosition: LatLng) => {
 *   markModified(nodeId);
 *   // ... update node position
 * };
 *
 * // Ao salvar
 * const handleSave = async () => {
 *   const syncedNodes = await syncElevations(nodes);
 *   // ... apply to GeoJSON and save
 * };
 * ```
 */
export function useElevationSyncOnDrag(
    options: UseElevationSyncOptions & {
        onDragEnd?: (syncedNode: MapNode) => void;
    }
) {
    const { onDragEnd, ...syncOptions } = options;
    const sync = useElevationSync(syncOptions);

    /**
     * Handle drag end with automatic elevation sync
     */
    const handleDragEnd = useCallback(
        (node: MapNode): MapNode => {
            const syncedNode = sync.syncNodeElevation(node);
            onDragEnd?.(syncedNode);
            return syncedNode;
        },
        [sync, onDragEnd]
    );

    return {
        ...sync,
        handleDragEnd,
    };
}
