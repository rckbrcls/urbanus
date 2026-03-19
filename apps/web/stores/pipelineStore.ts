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
}

// ============ ACTIONS ============

export interface PipelineActions {
  processProject: (projectId: string) => Promise<void>;
  reset: () => void;
}

// ============ STORE ============

const initialState: PipelineState = {
  status: 'idle',
  result: null,
  error: null,
};

export const usePipelineStore = create<PipelineState & PipelineActions>()(
  devtools(
    (set) => ({
      ...initialState,

      processProject: async (projectId: string) => {
        set({ status: 'processing', error: null });

        try {
          const res = await fetch(`/api/projects/${projectId}/process`, {
            method: 'POST',
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

      reset: () => set(initialState),
    }),
    { name: 'pipeline-store' },
  ),
);
