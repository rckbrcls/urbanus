/**
 * Singleton command manager exposed as reactive Zustand state.
 *
 * Components subscribe to canUndo/canRedo for button states.
 * The underlying CommandManager lives in lib/graph/commands.ts.
 */

import { create } from 'zustand';
import { CommandManager, type GraphCommand, type GraphStoreAccessor } from '@/lib/graph/commands';
import { useGraphStore } from './graphStore';

// ============ STATE ============

interface CommandManagerState {
  canUndo: boolean;
  canRedo: boolean;
  lastDescription: string | null;
  execute: (command: GraphCommand) => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
}

// ============ SINGLETON ============

const manager = new CommandManager();

/**
 * GraphStoreAccessor that reads/writes from the Zustand graphStore.
 */
const storeAccessor: GraphStoreAccessor = {
  getGraph: () => useGraphStore.getState().getGraph(),
  setNode: (id, node) => useGraphStore.getState().setNode(id, node),
  removeNode: (id) => useGraphStore.getState().removeNode(id),
  setEdge: (id, edge) => useGraphStore.getState().setEdge(id, edge),
  removeEdge: (id) => useGraphStore.getState().removeEdge(id),
  updateNodeEdgeIds: (nodeId, edgeIds) =>
    useGraphStore.getState().updateNodeEdgeIds(nodeId, edgeIds),
};

/** Access the store accessor for building commands. */
export function getStoreAccessor(): GraphStoreAccessor {
  return storeAccessor;
}

// ============ STORE ============

export const useCommandManager = create<CommandManagerState>()((set) => ({
  canUndo: false,
  canRedo: false,
  lastDescription: null,

  execute: (command) => {
    manager.execute(command);
    set({
      canUndo: manager.canUndo,
      canRedo: manager.canRedo,
      lastDescription: command.description,
    });
  },

  undo: () => {
    const cmd = manager.undo();
    set({
      canUndo: manager.canUndo,
      canRedo: manager.canRedo,
      lastDescription: cmd?.description ?? null,
    });
  },

  redo: () => {
    const cmd = manager.redo();
    set({
      canUndo: manager.canUndo,
      canRedo: manager.canRedo,
      lastDescription: cmd?.description ?? null,
    });
  },

  clear: () => {
    manager.clear();
    set({ canUndo: false, canRedo: false, lastDescription: null });
  },
}));
