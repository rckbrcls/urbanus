/**
 * Tipos para processamento de grafo
 */

import type { MapNode } from "./node.types";

/**
 * Opções para processamento de grafo
 */
export interface GraphProcessingOptions {
  maxEdgeLength: number; // em metros
  preserveElevations: boolean; // interpolar elevações
  minEdgeLength?: number; // mínimo para processar (opcional)
}

/**
 * Resultado do processamento de grafo
 */
export interface GraphProcessingResult {
  originalNodeCount: number;
  newNodeCount: number;
  processedEdges: number;
  skippedEdges: number;
  nodes: MapNode[];
  processingTime: number; // ms
}

/**
 * Análise de uma aresta
 */
export interface EdgeAnalysis {
  edgeId: string;
  streetId: string;
  streetName?: string;
  startNodeId: string;
  endNodeId: string;
  distance: number; // metros
  needsSubdivision: boolean;
  intermediateNodesNeeded: number;
}
