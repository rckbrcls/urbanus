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
  rules?: {
    maxSegmentLength?: number;
    minSegmentLength?: number;
    minSlope?: number;
    maxSlope?: number;
  };
}

/**
 * Estatísticas do processamento
 */
export interface GraphProcessingStats {
  originalNodeCount: number;
  newNodeCount: number;
  processedEdges: number;
  skippedEdges: number;
  processingTime: number; // ms
}

/**
 * Resultado do processamento de grafo
 */
export interface GraphProcessingResult extends GraphProcessingStats {
  streets: GeoJSON.FeatureCollection;
  nodes: MapNode[];
}

/**
 * Resultado da análise do grafo
 */
export interface GraphProcessingAnalysis {
  needsSubdivision: number;
  totalNodesNeeded: number;
  skippedEdges: number;
  totalEdges: number;
}
