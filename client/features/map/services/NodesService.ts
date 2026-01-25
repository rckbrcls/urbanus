/**
 * Serviço de Nós
 *
 * Gerencia CRUD de nós, histórico de ações (undo/redo) e aplicação em GeoJSON
 */

import { v4 as uuidv4 } from "uuid";
import { NodeValidator } from "../validators";
import { GeoCalculations } from "@/lib/geo";
import type { LatLng, BoundingBox } from "../types";
import type {
  MapNode,
  NodeAction,
  MoveValidationResult,
} from "../types/node.types";

// ============ TYPES ============

export interface NodeOperationResult {
  nodes: MapNode[];
  action: NodeAction;
}

export interface UndoRedoResult {
  nodes: MapNode[];
  action: NodeAction | null;
}

export interface BatchOperationResult {
  nodes: MapNode[];
  actions: NodeAction[];
  failedIds: string[];
}

export interface NodeStats {
  total: number;
  endpoints: number;
  intermediate: number;
  selected: number;
  byStreet: Map<string, number>;
}

// ============ SERVICE ============

export class NodesService {
  private static instance: NodesService;
  private validator: NodeValidator;

  // Undo/Redo stacks
  private undoStack: NodeAction[] = [];
  private redoStack: NodeAction[] = [];
  private readonly MAX_HISTORY = 100;

  private constructor() {
    this.validator = new NodeValidator();
  }

  static getInstance(): NodesService {
    if (!this.instance) {
      this.instance = new NodesService();
    }
    return this.instance;
  }

  // ============ EXTRACTION ============

  /**
   * Extrai nós de um GeoJSON de ruas
   */
  extractNodesFromStreets(streets: GeoJSON.FeatureCollection): MapNode[] {
    const nodes: MapNode[] = [];
    const nodeMap = new Map<string, MapNode>();
    const intersectionMap = new Map<string, string[]>(); // posKey -> streetIds

    streets.features.forEach((feature) => {
      if (feature.geometry.type !== "LineString") return;

      const streetId = feature.properties?.id?.toString() || uuidv4();
      const streetName = feature.properties?.name || "Unnamed";
      const coordinates = feature.geometry.coordinates as [number, number][];
      const elevations =
        (feature.properties?.vertex_elevations as (number | null)[]) || [];

      coordinates.forEach((coord, index) => {
        const [lng, lat] = coord;
        const posKey = `${lat.toFixed(6)},${lng.toFixed(6)}`;

        // Track intersections
        const streetIds = intersectionMap.get(posKey) || [];
        streetIds.push(streetId);
        intersectionMap.set(posKey, streetIds);

        // Verifica se já existe nó nessa posição (interseção)
        if (nodeMap.has(posKey)) {
          const existing = nodeMap.get(posKey)!;
          // Nó compartilhado - é uma interseção
          existing.isEndpoint = false;
          existing.isIntersection = true;
          existing.connectedStreets = streetIds;
          return;
        }

        const node: MapNode = {
          id: uuidv4(),
          position: { lat, lng },
          elevation: elevations[index] ?? null,
          streetId,
          streetName,
          vertexIndex: index,
          isEndpoint: index === 0 || index === coordinates.length - 1,
          isIntersection: false,
          connectedStreets: [streetId],
          isSelected: false,
          isHovered: false,
          isDragging: false,
          isLocked: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        nodes.push(node);
        nodeMap.set(posKey, node);
      });
    });

    return nodes;
  }

  // ============ VALIDATION ============

  /**
   * Valida movimento de um nó
   */
  validateMove(
    node: MapNode,
    newPosition: LatLng,
    allNodes: MapNode[],
    bbox: BoundingBox,
  ): MoveValidationResult {
    return this.validator.validateMove(node, newPosition, allNodes, bbox);
  }

  /**
   * Valida se um nó pode ser deletado
   */
  validateDelete(node: MapNode): {
    valid: boolean;
    error?: { code: string; message: string };
  } {
    return this.validator.validateDelete(node);
  }

  // ============ SINGLE NODE OPERATIONS ============

  /**
   * Move um nó para nova posição
   */
  moveNode(
    nodes: MapNode[],
    nodeId: string,
    newPosition: LatLng,
  ): NodeOperationResult {
    const nodeIndex = nodes.findIndex((n) => n.id === nodeId);
    if (nodeIndex === -1) {
      throw new NodeOperationError(
        `Nó não encontrado: ${nodeId}`,
        "NODE_NOT_FOUND",
      );
    }

    const node = nodes[nodeIndex];

    if (node.isLocked) {
      throw new NodeOperationError("Nó está bloqueado", "NODE_LOCKED");
    }

    const previousPosition = { ...node.position };
    const updatedNodes = [...nodes];
    updatedNodes[nodeIndex] = {
      ...node,
      position: newPosition,
      updatedAt: Date.now(),
    };

    const action: NodeAction = {
      type: "move",
      nodeId,
      previousState: { position: previousPosition },
      newState: { position: newPosition },
      timestamp: Date.now(),
    };

    this.pushToUndo(action);

    return { nodes: updatedNodes, action };
  }

  /**
   * Remove um nó
   */
  deleteNode(nodes: MapNode[], nodeId: string): NodeOperationResult {
    const nodeIndex = nodes.findIndex((n) => n.id === nodeId);
    if (nodeIndex === -1) {
      throw new NodeOperationError(
        `Nó não encontrado: ${nodeId}`,
        "NODE_NOT_FOUND",
      );
    }

    const node = nodes[nodeIndex];

    if (node.isLocked) {
      throw new NodeOperationError("Nó está bloqueado", "NODE_LOCKED");
    }

    const validation = this.validateDelete(node);
    if (!validation.valid && validation.error) {
      throw new NodeOperationError(
        validation.error.message,
        validation.error.code,
      );
    }

    const action: NodeAction = {
      type: "delete",
      nodeId,
      previousState: { ...node },
      newState: {},
      timestamp: Date.now(),
    };

    const updatedNodes = nodes.filter((n) => n.id !== nodeId);
    this.pushToUndo(action);

    return { nodes: updatedNodes, action };
  }

  /**
   * Cria um novo nó (para inserção de ponto intermediário)
   */
  createNode(
    nodes: MapNode[],
    streetId: string,
    position: LatLng,
    afterIndex: number,
    elevation?: number | null,
  ): NodeOperationResult {
    const streetNodes = nodes.filter((n) => n.streetId === streetId);

    // Encontrar nome da rua do primeiro nó dessa rua
    const streetName = streetNodes[0]?.streetName || "Unnamed";

    const newNode: MapNode = {
      id: uuidv4(),
      position,
      elevation: elevation ?? null,
      streetId,
      streetName,
      vertexIndex: afterIndex + 1,
      isEndpoint: false,
      isIntersection: false,
      connectedStreets: [streetId],
      isSelected: false,
      isHovered: false,
      isDragging: false,
      isLocked: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Atualizar índices dos nós subsequentes
    const updatedNodes = nodes.map((n) => {
      if (n.streetId === streetId && n.vertexIndex > afterIndex) {
        return { ...n, vertexIndex: n.vertexIndex + 1, updatedAt: Date.now() };
      }
      return n;
    });

    updatedNodes.push(newNode);

    const action: NodeAction = {
      type: "create",
      nodeId: newNode.id,
      previousState: {},
      newState: { ...newNode },
      timestamp: Date.now(),
    };

    this.pushToUndo(action);

    return { nodes: updatedNodes, action };
  }

  // ============ BATCH OPERATIONS ============

  /**
   * Move múltiplos nós de uma vez
   */
  moveNodes(
    nodes: MapNode[],
    movements: Array<{ nodeId: string; newPosition: LatLng }>,
  ): BatchOperationResult {
    const actions: NodeAction[] = [];
    const failedIds: string[] = [];
    let currentNodes = [...nodes];

    movements.forEach(({ nodeId, newPosition }) => {
      try {
        const result = this.moveNodeInternal(currentNodes, nodeId, newPosition);
        currentNodes = result.nodes;
        actions.push(result.action);
      } catch {
        failedIds.push(nodeId);
      }
    });

    // Agrupar ações em uma única ação de batch para undo
    if (actions.length > 0) {
      const batchAction: NodeAction = {
        type: "batch",
        nodeId: "batch",
        previousState: { actions: actions.map((a) => a.previousState) },
        newState: { actions: actions.map((a) => a.newState) },
        timestamp: Date.now(),
        batchActions: actions,
      };
      this.pushToUndo(batchAction);
    }

    return { nodes: currentNodes, actions, failedIds };
  }

  /**
   * Move nó internamente (sem adicionar ao histórico)
   */
  private moveNodeInternal(
    nodes: MapNode[],
    nodeId: string,
    newPosition: LatLng,
  ): NodeOperationResult {
    const nodeIndex = nodes.findIndex((n) => n.id === nodeId);
    if (nodeIndex === -1) {
      throw new Error(`Nó não encontrado: ${nodeId}`);
    }

    const node = nodes[nodeIndex];
    const previousPosition = { ...node.position };

    const updatedNodes = [...nodes];
    updatedNodes[nodeIndex] = {
      ...node,
      position: newPosition,
      updatedAt: Date.now(),
    };

    const action: NodeAction = {
      type: "move",
      nodeId,
      previousState: { position: previousPosition },
      newState: { position: newPosition },
      timestamp: Date.now(),
    };

    return { nodes: updatedNodes, action };
  }

  /**
   * Deleta múltiplos nós
   */
  deleteNodes(nodes: MapNode[], nodeIds: string[]): BatchOperationResult {
    const actions: NodeAction[] = [];
    const failedIds: string[] = [];
    let currentNodes = [...nodes];

    nodeIds.forEach((nodeId) => {
      const node = currentNodes.find((n) => n.id === nodeId);
      if (!node) {
        failedIds.push(nodeId);
        return;
      }

      if (node.isLocked || node.isEndpoint) {
        failedIds.push(nodeId);
        return;
      }

      const action: NodeAction = {
        type: "delete",
        nodeId,
        previousState: { ...node },
        newState: {},
        timestamp: Date.now(),
      };

      currentNodes = currentNodes.filter((n) => n.id !== nodeId);
      actions.push(action);
    });

    if (actions.length > 0) {
      const batchAction: NodeAction = {
        type: "batch",
        nodeId: "batch",
        previousState: { deletedNodes: actions.map((a) => a.previousState) },
        newState: {},
        timestamp: Date.now(),
        batchActions: actions,
      };
      this.pushToUndo(batchAction);
    }

    return { nodes: currentNodes, actions, failedIds };
  }

  // ============ UNDO/REDO ============

  /**
   * Desfaz última ação
   */
  undo(nodes: MapNode[]): UndoRedoResult {
    const action = this.undoStack.pop();
    if (!action) {
      return { nodes, action: null };
    }

    let updatedNodes = [...nodes];

    // Handle batch actions
    if (action.type === "batch" && action.batchActions) {
      // Undo in reverse order
      for (let i = action.batchActions.length - 1; i >= 0; i--) {
        updatedNodes = this.undoSingleAction(
          updatedNodes,
          action.batchActions[i],
        );
      }
    } else {
      updatedNodes = this.undoSingleAction(updatedNodes, action);
    }

    // Push to redo stack
    this.redoStack.push(action);

    return { nodes: updatedNodes, action };
  }

  /**
   * Refaz última ação desfeita
   */
  redo(nodes: MapNode[]): UndoRedoResult {
    const action = this.redoStack.pop();
    if (!action) {
      return { nodes, action: null };
    }

    let updatedNodes = [...nodes];

    // Handle batch actions
    if (action.type === "batch" && action.batchActions) {
      for (const batchAction of action.batchActions) {
        updatedNodes = this.redoSingleAction(updatedNodes, batchAction);
      }
    } else {
      updatedNodes = this.redoSingleAction(updatedNodes, action);
    }

    // Push back to undo stack
    this.undoStack.push(action);

    return { nodes: updatedNodes, action };
  }

  /**
   * Desfaz uma única ação
   */
  private undoSingleAction(nodes: MapNode[], action: NodeAction): MapNode[] {
    let updatedNodes = [...nodes];

    switch (action.type) {
      case "move": {
        const nodeIndex = updatedNodes.findIndex((n) => n.id === action.nodeId);
        if (nodeIndex !== -1 && action.previousState.position) {
          updatedNodes[nodeIndex] = {
            ...updatedNodes[nodeIndex],
            position: action.previousState.position,
            updatedAt: Date.now(),
          };
        }
        break;
      }
      case "delete": {
        const restoredNode = action.previousState as MapNode;
        if (restoredNode.id) {
          updatedNodes.push({ ...restoredNode, updatedAt: Date.now() });
        }
        break;
      }
      case "create": {
        updatedNodes = updatedNodes.filter((n) => n.id !== action.nodeId);
        break;
      }
    }

    return updatedNodes;
  }

  /**
   * Refaz uma única ação
   */
  private redoSingleAction(nodes: MapNode[], action: NodeAction): MapNode[] {
    let updatedNodes = [...nodes];

    switch (action.type) {
      case "move": {
        const nodeIndex = updatedNodes.findIndex((n) => n.id === action.nodeId);
        if (nodeIndex !== -1 && action.newState.position) {
          updatedNodes[nodeIndex] = {
            ...updatedNodes[nodeIndex],
            position: action.newState.position,
            updatedAt: Date.now(),
          };
        }
        break;
      }
      case "delete": {
        updatedNodes = updatedNodes.filter((n) => n.id !== action.nodeId);
        break;
      }
      case "create": {
        const newNode = action.newState as MapNode;
        if (newNode.id) {
          updatedNodes.push({ ...newNode, updatedAt: Date.now() });
        }
        break;
      }
    }

    return updatedNodes;
  }

  /**
   * Adiciona ação ao histórico de undo
   */
  private pushToUndo(action: NodeAction): void {
    this.undoStack.push(action);
    // Limpar redo quando nova ação é feita
    this.redoStack = [];

    // Limitar tamanho do histórico
    if (this.undoStack.length > this.MAX_HISTORY) {
      this.undoStack.shift();
    }
  }

  // ============ SELECTION ============

  /**
   * Seleciona um único nó
   */
  selectNode(
    nodes: MapNode[],
    nodeId: string,
    addToSelection = false,
  ): MapNode[] {
    return nodes.map((node) => ({
      ...node,
      isSelected: addToSelection
        ? node.isSelected || node.id === nodeId
        : node.id === nodeId,
    }));
  }

  /**
   * Seleciona múltiplos nós
   */
  selectNodes(
    nodes: MapNode[],
    nodeIds: string[],
    addToSelection = false,
  ): MapNode[] {
    const idSet = new Set(nodeIds);
    return nodes.map((node) => ({
      ...node,
      isSelected: addToSelection
        ? node.isSelected || idSet.has(node.id)
        : idSet.has(node.id),
    }));
  }

  /**
   * Inverte seleção de um nó
   */
  toggleNodeSelection(nodes: MapNode[], nodeId: string): MapNode[] {
    return nodes.map((node) => ({
      ...node,
      isSelected: node.id === nodeId ? !node.isSelected : node.isSelected,
    }));
  }

  /**
   * Seleciona todos os nós de uma rua
   */
  selectStreet(
    nodes: MapNode[],
    streetId: string,
    addToSelection = false,
  ): MapNode[] {
    return nodes.map((node) => ({
      ...node,
      isSelected: addToSelection
        ? node.isSelected || node.streetId === streetId
        : node.streetId === streetId,
    }));
  }

  /**
   * Seleciona nós em uma região retangular
   */
  selectInRegion(
    nodes: MapNode[],
    bbox: BoundingBox,
    addToSelection = false,
  ): MapNode[] {
    return nodes.map((node) => {
      const inRegion = GeoCalculations.isInsideBbox(node.position, bbox);
      return {
        ...node,
        isSelected: addToSelection ? node.isSelected || inRegion : inRegion,
      };
    });
  }

  /**
   * Limpa seleção de todos os nós
   */
  clearSelection(nodes: MapNode[]): MapNode[] {
    return nodes.map((node) => ({
      ...node,
      isSelected: false,
      isHovered: false,
    }));
  }

  /**
   * Obtém nós selecionados
   */
  getSelectedNodes(nodes: MapNode[]): MapNode[] {
    return nodes.filter((node) => node.isSelected);
  }

  /**
   * Obtém IDs dos nós selecionados
   */
  getSelectedNodeIds(nodes: MapNode[]): string[] {
    return nodes.filter((node) => node.isSelected).map((node) => node.id);
  }

  // ============ HOVER/LOCK ============

  /**
   * Define hover em um nó
   */
  setHoveredNode(nodes: MapNode[], nodeId: string | null): MapNode[] {
    return nodes.map((node) => ({
      ...node,
      isHovered: node.id === nodeId,
    }));
  }

  /**
   * Bloqueia/desbloqueia nós
   */
  setNodesLocked(
    nodes: MapNode[],
    nodeIds: string[],
    locked: boolean,
  ): MapNode[] {
    const idSet = new Set(nodeIds);
    return nodes.map((node) =>
      idSet.has(node.id)
        ? { ...node, isLocked: locked, updatedAt: Date.now() }
        : node,
    );
  }

  // ============ GEOJSON OPERATIONS ============

  /**
   * Aplica modificações de nós de volta ao GeoJSON
   */
  applyNodesToStreets(
    streets: GeoJSON.FeatureCollection,
    nodes: MapNode[],
  ): GeoJSON.FeatureCollection {
    // Agrupa nós por streetId
    const nodesByStreet = new Map<string, MapNode[]>();
    nodes.forEach((node) => {
      const existing = nodesByStreet.get(node.streetId) || [];
      existing.push(node);
      nodesByStreet.set(node.streetId, existing);
    });

    const updatedFeatures = streets.features.map((feature) => {
      const streetId = feature.properties?.id?.toString();
      if (!streetId || feature.geometry.type !== "LineString") {
        return feature;
      }

      const streetNodes = nodesByStreet.get(streetId);
      if (!streetNodes) return feature;

      // Ordena por vertexIndex e reconstrói coordenadas
      const sortedNodes = [...streetNodes].sort(
        (a, b) => a.vertexIndex - b.vertexIndex,
      );
      const newCoordinates = sortedNodes.map((node) => [
        node.position.lng,
        node.position.lat,
      ]);

      // Atualiza elevações
      const newElevations = sortedNodes.map((node) => node.elevation);

      return {
        ...feature,
        geometry: {
          ...feature.geometry,
          coordinates: newCoordinates,
        },
        properties: {
          ...feature.properties,
          vertex_elevations: newElevations,
          modified: true,
          modifiedAt: Date.now(),
        },
      };
    });

    return {
      ...streets,
      features: updatedFeatures,
    };
  }

  // ============ STATISTICS ============

  /**
   * Calcula estatísticas dos nós
   */
  getStats(nodes: MapNode[]): NodeStats {
    const byStreet = new Map<string, number>();
    let endpoints = 0;
    let selected = 0;

    nodes.forEach((node) => {
      if (node.isEndpoint) endpoints++;
      if (node.isSelected) selected++;

      const streetCount = byStreet.get(node.streetId) || 0;
      byStreet.set(node.streetId, streetCount + 1);
    });

    return {
      total: nodes.length,
      endpoints,
      intermediate: nodes.length - endpoints,
      selected,
      byStreet,
    };
  }

  // ============ HISTORY MANAGEMENT ============

  /**
   * Limpa histórico de ações
   */
  clearHistory(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  /**
   * Verifica se pode desfazer
   */
  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /**
   * Verifica se pode refazer
   */
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * Obtém tamanho do histórico de undo
   */
  getUndoSize(): number {
    return this.undoStack.length;
  }

  /**
   * Obtém tamanho do histórico de redo
   */
  getRedoSize(): number {
    return this.redoStack.length;
  }
}

// ============ ERRORS ============

export type NodeErrorCode =
  | "NODE_NOT_FOUND"
  | "NODE_LOCKED"
  | "CANNOT_DELETE_ENDPOINT"
  | "OUTSIDE_BOUNDS"
  | "INVALID_POSITION";

/**
 * Classe de erro customizada para operações com nós
 */
export class NodeOperationError extends Error {
  constructor(
    message: string,
    public code: NodeErrorCode | string,
  ) {
    super(message);
    this.name = "NodeOperationError";
  }

  isRetryable(): boolean {
    return false;
  }
}
