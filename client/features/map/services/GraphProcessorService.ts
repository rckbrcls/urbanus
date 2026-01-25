/**
 * Serviço de Processamento de Grafo
 *
 * Implementa o algoritmo URBANUS de subdivisão de arestas
 * para normalizar o comprimento das arestas do grafo.
 */

import { NodesService } from "./NodesService";
import { GeoCalculations } from "@/lib/geo/calculations";
import type { MapNode, LatLng } from "../types";
import type {
  GraphProcessingOptions,
  GraphProcessingResult,
  EdgeAnalysis,
} from "../types/graph.types";

// ============ SERVICE ============

export class GraphProcessorService {
  private static instance: GraphProcessorService;
  private nodesService: NodesService;

  private constructor() {
    this.nodesService = NodesService.getInstance();
  }

  static getInstance(): GraphProcessorService {
    if (!this.instance) {
      this.instance = new GraphProcessorService();
    }
    return this.instance;
  }

  // ============ MAIN PROCESSING ============

  /**
   * Processa o grafo subdividindo arestas que excedem maxEdgeLength
   */
  processGraph(
    nodes: MapNode[],
    options: GraphProcessingOptions,
  ): GraphProcessingResult {
    const startTime = performance.now();

    // Validações
    if (options.maxEdgeLength <= 0) {
      throw new Error("maxEdgeLength deve ser maior que zero");
    }

    if (nodes.length === 0) {
      return {
        originalNodeCount: 0,
        newNodeCount: 0,
        processedEdges: 0,
        skippedEdges: 0,
        nodes: [],
        processingTime: 0,
      };
    }

    const originalNodeCount = nodes.length;
    let processedEdges = 0;
    let skippedEdges = 0;
    let newNodeCount = 0;

    // Agrupar nós por streetId
    const nodesByStreet = new Map<string, MapNode[]>();
    nodes.forEach((node) => {
      const existing = nodesByStreet.get(node.streetId) || [];
      existing.push(node);
      nodesByStreet.set(node.streetId, existing);
    });

    // Ordenar nós por vertexIndex em cada rua
    nodesByStreet.forEach((streetNodes, streetId) => {
      streetNodes.sort((a, b) => a.vertexIndex - b.vertexIndex);
    });

    // Processar cada rua
    let processedNodes = [...nodes];

    nodesByStreet.forEach((streetNodes, streetId) => {
      // Processar arestas consecutivas
      for (let i = 0; i < streetNodes.length - 1; i++) {
        const startNode = streetNodes[i];
        const endNode = streetNodes[i + 1];

        // Encontrar nós atualizados no processedNodes
        const currentStartNode = processedNodes.find(
          (n) => n.id === startNode.id,
        );
        const currentEndNode = processedNodes.find((n) => n.id === endNode.id);

        if (!currentStartNode || !currentEndNode) continue;

        // Calcular distância
        const distance = GeoCalculations.calculateDistance(
          currentStartNode.position,
          currentEndNode.position,
        );

        // Verificar se precisa subdividir
        if (distance > options.maxEdgeLength) {
          // Calcular número de nós intermediários
          const numIntermediates = Math.floor(distance / options.maxEdgeLength);

          // Criar nós intermediários (um de cada vez para manter índices corretos)
          for (let j = 1; j <= numIntermediates; j++) {
            // Re-encontrar nós atualizados após cada criação
            const updatedStartNode = processedNodes.find(
              (n) => n.id === startNode.id,
            );
            const updatedEndNode = processedNodes.find(
              (n) => n.id === endNode.id,
            );

            if (!updatedStartNode || !updatedEndNode) break;

            const alpha = j / (numIntermediates + 1);

            // Interpolar posição
            const newPosition = this.interpolatePosition(
              updatedStartNode.position,
              updatedEndNode.position,
              alpha,
            );

            // Interpolar elevação se necessário
            const newElevation = options.preserveElevations
              ? this.interpolateElevation(
                  updatedStartNode.elevation,
                  updatedEndNode.elevation,
                  alpha,
                )
              : null;

            // O createNode espera afterIndex (índice do nó anterior)
            // Após criar o primeiro nó, o índice do startNode permanece o mesmo
            // mas precisamos usar o índice atualizado
            const afterIndex = updatedStartNode.vertexIndex;

            // Criar novo nó
            const result = this.nodesService.createNode(
              processedNodes,
              streetId,
              newPosition,
              afterIndex,
              newElevation,
            );

            processedNodes = result.nodes;
            newNodeCount++;
          }

          processedEdges++;
        } else {
          skippedEdges++;
        }
      }
    });

    const processingTime = performance.now() - startTime;

    return {
      originalNodeCount,
      newNodeCount,
      processedEdges,
      skippedEdges,
      nodes: processedNodes,
      processingTime,
    };
  }

  // ============ ANALYSIS ============

  /**
   * Analisa arestas sem processar
   */
  analyzeEdges(nodes: MapNode[], maxEdgeLength: number): EdgeAnalysis[] {
    const analysis: EdgeAnalysis[] = [];

    // Agrupar nós por streetId
    const nodesByStreet = new Map<string, MapNode[]>();
    nodes.forEach((node) => {
      const existing = nodesByStreet.get(node.streetId) || [];
      existing.push(node);
      nodesByStreet.set(node.streetId, existing);
    });

    // Ordenar nós por vertexIndex em cada rua
    nodesByStreet.forEach((streetNodes, streetId) => {
      streetNodes.sort((a, b) => a.vertexIndex - b.vertexIndex);
    });

    // Analisar cada aresta
    nodesByStreet.forEach((streetNodes, streetId) => {
      for (let i = 0; i < streetNodes.length - 1; i++) {
        const startNode = streetNodes[i];
        const endNode = streetNodes[i + 1];

        const distance = GeoCalculations.calculateDistance(
          startNode.position,
          endNode.position,
        );

        const needsSubdivision = distance > maxEdgeLength;
        const intermediateNodesNeeded = needsSubdivision
          ? Math.floor(distance / maxEdgeLength)
          : 0;

        analysis.push({
          edgeId: `${streetId}-${startNode.vertexIndex}-${endNode.vertexIndex}`,
          streetId,
          streetName: startNode.streetName,
          startNodeId: startNode.id,
          endNodeId: endNode.id,
          distance,
          needsSubdivision,
          intermediateNodesNeeded,
        });
      }
    });

    return analysis;
  }

  // ============ INTERPOLATION ============

  /**
   * Interpola posição linearmente entre dois pontos
   * @param start Ponto inicial
   * @param end Ponto final
   * @param alpha Fator de interpolação (0 = start, 1 = end)
   */
  interpolatePosition(start: LatLng, end: LatLng, alpha: number): LatLng {
    return {
      lat: start.lat + alpha * (end.lat - start.lat),
      lng: start.lng + alpha * (end.lng - start.lng),
    };
  }

  /**
   * Interpola elevação linearmente entre dois valores
   * @param start Elevação inicial (pode ser null)
   * @param end Elevação final (pode ser null)
   * @param alpha Fator de interpolação (0 = start, 1 = end)
   */
  interpolateElevation(
    start: number | null,
    end: number | null,
    alpha: number,
  ): number | null {
    if (start === null || end === null) {
      return null;
    }
    return start + alpha * (end - start);
  }
}
