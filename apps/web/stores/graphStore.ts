/**
 * Graph Store — Zustand store for the network editor graph.
 *
 * Uses immer for immutable updates of deeply nested node/edge records.
 * The graph is the source of truth during editing; MapNode[] is derived
 * for API persistence via serialization.ts.
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import type { NetworkNode, NetworkEdge, NetworkGraph, EditingMode } from '@/lib/graph/types';

// ============ STATE ============

export interface GraphState {
  nodes: Record<string, NetworkNode>;
  edges: Record<string, NetworkEdge>;
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  hoveredFeatureId: string | null;
  editingMode: EditingMode;
}

// ============ ACTIONS ============

export interface GraphActions {
  // Node mutations
  addNode: (node: NetworkNode) => void;
  moveNode: (id: string, coordinates: [number, number, number]) => void;
  removeNode: (id: string) => void;
  setNode: (id: string, node: NetworkNode) => void;
  updateNodeEdgeIds: (nodeId: string, edgeIds: string[]) => void;

  // Edge mutations
  addEdge: (edge: NetworkEdge) => void;
  removeEdge: (id: string) => void;
  setEdge: (id: string, edge: NetworkEdge) => void;

  // Selection
  setSelection: (nodeIds: string[], edgeIds?: string[]) => void;
  clearSelection: () => void;

  // Hover
  setHover: (featureId: string | null) => void;

  // Mode
  setMode: (mode: EditingMode) => void;

  // Bulk
  loadGraph: (graph: NetworkGraph) => void;
  reset: () => void;

  // Accessor for commands
  getGraph: () => NetworkGraph;
}

// ============ INITIAL ============

const initialState: GraphState = {
  nodes: {},
  edges: {},
  selectedNodeIds: [],
  selectedEdgeIds: [],
  hoveredFeatureId: null,
  editingMode: 'select',
};

// ============ STORE ============

export const useGraphStore = create<GraphState & GraphActions>()(
  devtools(
    subscribeWithSelector(
      immer((set, get) => ({
        ...initialState,

        // ---- Node mutations ----
        addNode: (node) => {
          set((s) => {
            s.nodes[node.id] = node;
          });
        },

        moveNode: (id, coordinates) => {
          set((s) => {
            const node = s.nodes[id];
            if (node) {
              node.coordinates = coordinates;
              node.properties.elevation = isNaN(coordinates[2]) ? null : coordinates[2];
            }
          });
        },

        removeNode: (id) => {
          set((s) => {
            delete s.nodes[id];
            // Clean up selection
            s.selectedNodeIds = s.selectedNodeIds.filter((nid) => nid !== id);
          });
        },

        setNode: (id, node) => {
          set((s) => {
            s.nodes[id] = node;
          });
        },

        updateNodeEdgeIds: (nodeId, edgeIds) => {
          set((s) => {
            const node = s.nodes[nodeId];
            if (node) {
              node.properties.edgeIds = edgeIds;
            }
          });
        },

        // ---- Edge mutations ----
        addEdge: (edge) => {
          set((s) => {
            s.edges[edge.id] = edge;
          });
        },

        removeEdge: (id) => {
          set((s) => {
            delete s.edges[id];
            s.selectedEdgeIds = s.selectedEdgeIds.filter((eid) => eid !== id);
          });
        },

        setEdge: (id, edge) => {
          set((s) => {
            s.edges[id] = edge;
          });
        },

        // ---- Selection ----
        setSelection: (nodeIds, edgeIds) => {
          set((s) => {
            s.selectedNodeIds = nodeIds;
            s.selectedEdgeIds = edgeIds ?? [];
          });
        },

        clearSelection: () => {
          set((s) => {
            s.selectedNodeIds = [];
            s.selectedEdgeIds = [];
          });
        },

        // ---- Hover ----
        setHover: (featureId) => {
          set((s) => {
            s.hoveredFeatureId = featureId;
          });
        },

        // ---- Mode ----
        setMode: (mode) => {
          set((s) => {
            s.editingMode = mode;
          });
        },

        // ---- Bulk ----
        loadGraph: (graph) => {
          set((s) => {
            s.nodes = graph.nodes;
            s.edges = graph.edges;
            s.selectedNodeIds = [];
            s.selectedEdgeIds = [];
            s.hoveredFeatureId = null;
          });
        },

        reset: () => {
          set(() => ({ ...initialState }));
        },

        // ---- Accessor ----
        getGraph: () => {
          const { nodes, edges } = get();
          return { nodes, edges };
        },
      })),
    ),
    { name: 'graphStore' },
  ),
);
