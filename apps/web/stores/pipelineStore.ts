/**
 * Pipeline Store — Zustand store for sewer network processing state.
 *
 * Manages the lifecycle of the 8-step pipeline: idle → processing → success/error.
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { SewerNetwork } from '@/types/sewer';

// ============ STATE ============

type PipelineStatus = 'idle' | 'processing' | 'success' | 'error';

export interface PipelineState {
  status: PipelineStatus;
  result: SewerNetwork | null;
  error: string | null;
  _cachedResult: SewerNetwork | null;
  selectedNodeId: string | null;
}

// ============ ACTIONS ============

export interface PipelineActions {
  processProject: (projectId: string, editedGraph?: { nodes: unknown[]; edges: unknown[] }) => Promise<void>;
  hydrateResult: (result: SewerNetwork | null) => void;
  reset: () => void;
  toggleView: () => void;
  selectSewerNode: (nodeId: string | null) => void;
  toggleCollectionPoint: (nodeId: string) => void;
  removeSewerNode: (nodeId: string) => void;
  moveSewerNode: (nodeId: string, lat: number, lng: number) => void;
}

// ============ STORE ============

const initialState: PipelineState = {
  status: 'idle',
  result: null,
  error: null,
  _cachedResult: null,
  selectedNodeId: null,
};

export const usePipelineStore = create<PipelineState & PipelineActions>()(
  devtools(
    (set, get) => ({
      ...initialState,

      processProject: async (projectId: string, editedGraph?: { nodes: unknown[]; edges: unknown[] }) => {
        set({ status: 'processing', error: null, _cachedResult: null });

        try {
          const res = await fetch(`/api/projects/${projectId}/process`, {
            method: 'POST',
            headers: editedGraph ? { 'Content-Type': 'application/json' } : {},
            body: editedGraph ? JSON.stringify(editedGraph) : undefined,
          });

          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(body.error ?? `Pipeline failed (${res.status})`);
          }

          const result: SewerNetwork = await res.json();
          set({ status: 'success', result });
        } catch (err) {
          set({
            status: 'error',
            error: err instanceof Error ? err.message : String(err),
          });
        }
      },

      hydrateResult: (result) =>
        set({
          status: result ? 'success' : 'idle',
          result,
          error: null,
          _cachedResult: null,
          selectedNodeId: null,
        }),

      reset: () => set(initialState),

      toggleView: () => {
        const { result, _cachedResult } = get();
        if (result) {
          set({ result: null, _cachedResult: result, selectedNodeId: null });
        } else if (_cachedResult) {
          set({ result: _cachedResult, _cachedResult: null, status: 'success' });
        }
      },

      selectSewerNode: (nodeId) => set({ selectedNodeId: nodeId }),

      toggleCollectionPoint: (nodeId) => {
        const { result } = get();
        if (!result) return;
        set({
          result: {
            ...result,
            nodes: result.nodes.map((n) =>
              n.id === nodeId ? { ...n, is_collection_point: !n.is_collection_point } : n,
            ),
          },
        });
      },

      removeSewerNode: (nodeId) => {
        const { result } = get();
        if (!result) return;
        set({
          result: {
            ...result,
            nodes: result.nodes.filter((n) => n.id !== nodeId),
            edges: result.edges.filter(
              (e) => e.source_node_id !== nodeId && e.target_node_id !== nodeId,
            ),
            pipes: result.pipes.filter((p) => {
              const edge = result.edges.find((e) => e.id === p.edge_id);
              return !edge || (edge.source_node_id !== nodeId && edge.target_node_id !== nodeId);
            }),
          },
          selectedNodeId: null,
        });
      },

      moveSewerNode: (nodeId, lat, lng) => {
        const { result } = get();
        if (!result) return;
        set({
          result: {
            ...result,
            nodes: result.nodes.map((n) =>
              n.id === nodeId ? { ...n, lat, lng } : n,
            ),
          },
        });
      },
    }),
    { name: 'pipeline-store' },
  ),
);
