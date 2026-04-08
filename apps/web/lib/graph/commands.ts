/**
 * Command Pattern for undo/redo in the graph editor.
 *
 * Each command encapsulates execute + undo. The CommandManager
 * maintains the stacks and exposes canUndo/canRedo.
 *
 * Commands mutate the graphStore directly (via getState/setState).
 */

import type { NetworkNode, NetworkEdge, NetworkGraph } from './types';

// ============ INTERFACE ============

export interface GraphCommand {
  execute(): void;
  undo(): void;
  readonly description: string;
}

// ============ COMMAND MANAGER ============

export class CommandManager {
  private undoStack: GraphCommand[] = [];
  private redoStack: GraphCommand[] = [];
  private maxHistory = 100;

  execute(command: GraphCommand): void {
    command.execute();
    this.undoStack.push(command);
    this.redoStack = []; // Clear redo on new action
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
  }

  undo(): GraphCommand | null {
    const command = this.undoStack.pop();
    if (!command) return null;
    command.undo();
    this.redoStack.push(command);
    return command;
  }

  redo(): GraphCommand | null {
    const command = this.redoStack.pop();
    if (!command) return null;
    command.execute();
    this.undoStack.push(command);
    return command;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}

// ============ GRAPH STORE ACCESSOR ============

/**
 * Commands need to read/write graph state.
 * We inject this interface to decouple from Zustand specifics.
 */
export interface GraphStoreAccessor {
  getGraph(): NetworkGraph;
  setGraph(graph: NetworkGraph): void;
  setNode(id: string, node: NetworkNode): void;
  removeNode(id: string): void;
  setEdge(id: string, edge: NetworkEdge): void;
  removeEdge(id: string): void;
  updateNodeEdgeIds(nodeId: string, edgeIds: string[]): void;
}

function cloneGraph(graph: NetworkGraph): NetworkGraph {
  return {
    nodes: Object.fromEntries(
      Object.entries(graph.nodes).map(([id, node]) => [
        id,
        {
          ...node,
          coordinates: [...node.coordinates] as [number, number, number],
          properties: {
            ...node.properties,
            edgeIds: [...node.properties.edgeIds],
            connectedStreets: node.properties.connectedStreets
              ? [...node.properties.connectedStreets]
              : undefined,
          },
        },
      ]),
    ),
    edges: Object.fromEntries(
      Object.entries(graph.edges).map(([id, edge]) => [
        id,
        {
          ...edge,
          geometry: edge.geometry.map((point) => [...point]),
          properties: {
            ...edge.properties,
          },
        },
      ]),
    ),
  };
}

// ============ BATCH COMMAND ============

export class BatchCommand implements GraphCommand {
  readonly description: string;
  private commands: GraphCommand[];

  constructor(commands: GraphCommand[], description?: string) {
    this.commands = commands;
    this.description = description ?? `Batch (${commands.length} actions)`;
  }

  execute(): void {
    for (const cmd of this.commands) {
      cmd.execute();
    }
  }

  undo(): void {
    // Undo in reverse order
    for (let i = this.commands.length - 1; i >= 0; i--) {
      this.commands[i].undo();
    }
  }
}

export class ReplaceGraphCommand implements GraphCommand {
  readonly description: string;
  private store: GraphStoreAccessor;
  private previousGraph: NetworkGraph;
  private nextGraph: NetworkGraph;
  private onExecute?: () => void;
  private onUndo?: () => void;

  constructor(
    store: GraphStoreAccessor,
    previousGraph: NetworkGraph,
    nextGraph: NetworkGraph,
    options?: {
      description?: string;
      onExecute?: () => void;
      onUndo?: () => void;
    },
  ) {
    this.store = store;
    this.previousGraph = cloneGraph(previousGraph);
    this.nextGraph = cloneGraph(nextGraph);
    this.description = options?.description ?? 'Replace graph';
    this.onExecute = options?.onExecute;
    this.onUndo = options?.onUndo;
  }

  execute(): void {
    this.store.setGraph(cloneGraph(this.nextGraph));
    this.onExecute?.();
  }

  undo(): void {
    this.store.setGraph(cloneGraph(this.previousGraph));
    this.onUndo?.();
  }
}

// ============ CONCRETE COMMANDS ============

export class AddNodeCommand implements GraphCommand {
  readonly description: string;
  private node: NetworkNode;
  private store: GraphStoreAccessor;

  constructor(store: GraphStoreAccessor, node: NetworkNode) {
    this.store = store;
    this.node = node;
    this.description = `Add node ${node.id.slice(0, 8)}`;
  }

  execute(): void {
    this.store.setNode(this.node.id, this.node);
  }

  undo(): void {
    this.store.removeNode(this.node.id);
  }
}

export class RemoveNodeCommand implements GraphCommand {
  readonly description: string;
  private nodeId: string;
  private store: GraphStoreAccessor;
  private savedNode: NetworkNode | null = null;
  private savedEdges: NetworkEdge[] = [];

  constructor(store: GraphStoreAccessor, nodeId: string) {
    this.store = store;
    this.nodeId = nodeId;
    this.description = `Remove node ${nodeId.slice(0, 8)}`;
  }

  execute(): void {
    const graph = this.store.getGraph();
    this.savedNode = graph.nodes[this.nodeId] ?? null;

    // Save and remove connected edges
    this.savedEdges = Object.values(graph.edges).filter(
      (e) => e.sourceId === this.nodeId || e.targetId === this.nodeId,
    );
    for (const edge of this.savedEdges) {
      this.store.removeEdge(edge.id);
    }

    this.store.removeNode(this.nodeId);
  }

  undo(): void {
    if (this.savedNode) {
      this.store.setNode(this.nodeId, this.savedNode);
    }
    for (const edge of this.savedEdges) {
      this.store.setEdge(edge.id, edge);
    }
  }
}

export class MoveNodeCommand implements GraphCommand {
  readonly description: string;
  private nodeId: string;
  private store: GraphStoreAccessor;
  private oldCoordinates: [number, number, number];
  private newCoordinates: [number, number, number];

  constructor(
    store: GraphStoreAccessor,
    nodeId: string,
    oldCoordinates: [number, number, number],
    newCoordinates: [number, number, number],
  ) {
    this.store = store;
    this.nodeId = nodeId;
    this.oldCoordinates = oldCoordinates;
    this.newCoordinates = newCoordinates;
    this.description = `Move node ${nodeId.slice(0, 8)}`;
  }

  execute(): void {
    const graph = this.store.getGraph();
    const node = graph.nodes[this.nodeId];
    if (!node) return;
    this.store.setNode(this.nodeId, {
      ...node,
      coordinates: this.newCoordinates,
      properties: {
        ...node.properties,
        elevation: isNaN(this.newCoordinates[2]) ? null : this.newCoordinates[2],
      },
    });
  }

  undo(): void {
    const graph = this.store.getGraph();
    const node = graph.nodes[this.nodeId];
    if (!node) return;
    this.store.setNode(this.nodeId, {
      ...node,
      coordinates: this.oldCoordinates,
      properties: {
        ...node.properties,
        elevation: isNaN(this.oldCoordinates[2]) ? null : this.oldCoordinates[2],
      },
    });
  }
}

export class AddEdgeCommand implements GraphCommand {
  readonly description: string;
  private edge: NetworkEdge;
  private store: GraphStoreAccessor;

  constructor(store: GraphStoreAccessor, edge: NetworkEdge) {
    this.store = store;
    this.edge = edge;
    this.description = `Add edge ${edge.sourceId.slice(0, 8)} → ${edge.targetId.slice(0, 8)}`;
  }

  execute(): void {
    this.store.setEdge(this.edge.id, this.edge);
    // Update edgeIds on source/target
    const graph = this.store.getGraph();
    const source = graph.nodes[this.edge.sourceId];
    const target = graph.nodes[this.edge.targetId];
    if (source) {
      this.store.updateNodeEdgeIds(this.edge.sourceId, [...source.properties.edgeIds, this.edge.id]);
    }
    if (target) {
      this.store.updateNodeEdgeIds(this.edge.targetId, [...target.properties.edgeIds, this.edge.id]);
    }
  }

  undo(): void {
    const graph = this.store.getGraph();
    const source = graph.nodes[this.edge.sourceId];
    const target = graph.nodes[this.edge.targetId];
    if (source) {
      this.store.updateNodeEdgeIds(
        this.edge.sourceId,
        source.properties.edgeIds.filter((id) => id !== this.edge.id),
      );
    }
    if (target) {
      this.store.updateNodeEdgeIds(
        this.edge.targetId,
        target.properties.edgeIds.filter((id) => id !== this.edge.id),
      );
    }
    this.store.removeEdge(this.edge.id);
  }
}

export class RemoveEdgeCommand implements GraphCommand {
  readonly description: string;
  private edgeId: string;
  private store: GraphStoreAccessor;
  private savedEdge: NetworkEdge | null = null;

  constructor(store: GraphStoreAccessor, edgeId: string) {
    this.store = store;
    this.edgeId = edgeId;
    this.description = `Remove edge ${edgeId.slice(0, 8)}`;
  }

  execute(): void {
    const graph = this.store.getGraph();
    this.savedEdge = graph.edges[this.edgeId] ?? null;
    if (this.savedEdge) {
      // Update edgeIds on connected nodes
      const source = graph.nodes[this.savedEdge.sourceId];
      const target = graph.nodes[this.savedEdge.targetId];
      if (source) {
        this.store.updateNodeEdgeIds(
          this.savedEdge.sourceId,
          source.properties.edgeIds.filter((id) => id !== this.edgeId),
        );
      }
      if (target) {
        this.store.updateNodeEdgeIds(
          this.savedEdge.targetId,
          target.properties.edgeIds.filter((id) => id !== this.edgeId),
        );
      }
    }
    this.store.removeEdge(this.edgeId);
  }

  undo(): void {
    if (this.savedEdge) {
      this.store.setEdge(this.edgeId, this.savedEdge);
      const graph = this.store.getGraph();
      const source = graph.nodes[this.savedEdge.sourceId];
      const target = graph.nodes[this.savedEdge.targetId];
      if (source) {
        this.store.updateNodeEdgeIds(this.savedEdge.sourceId, [...source.properties.edgeIds, this.edgeId]);
      }
      if (target) {
        this.store.updateNodeEdgeIds(this.savedEdge.targetId, [...target.properties.edgeIds, this.edgeId]);
      }
    }
  }
}

/**
 * Split an edge by inserting a new node at a point along it.
 * Compound command: remove edge + add node + add 2 new edges.
 */
export class SplitEdgeCommand implements GraphCommand {
  readonly description: string;
  private commands: GraphCommand[];

  constructor(
    store: GraphStoreAccessor,
    edgeId: string,
    newNode: NetworkNode,
    newEdge1: NetworkEdge,
    newEdge2: NetworkEdge,
  ) {
    this.description = `Split edge ${edgeId.slice(0, 8)}`;
    this.commands = [
      new RemoveEdgeCommand(store, edgeId),
      new AddNodeCommand(store, newNode),
      new AddEdgeCommand(store, newEdge1),
      new AddEdgeCommand(store, newEdge2),
    ];
  }

  execute(): void {
    for (const cmd of this.commands) {
      cmd.execute();
    }
  }

  undo(): void {
    // Undo in reverse order
    for (let i = this.commands.length - 1; i >= 0; i--) {
      this.commands[i].undo();
    }
  }
}
