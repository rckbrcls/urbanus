/**
 * Serviço de Processamento de Grafo (backend)
 *
 * Encaminha o processamento para o servidor Python.
 */

import type {
  GraphProcessingOptions,
  GraphProcessingStats,
  GraphProcessingAnalysis,
} from "../types/graph.types";

export interface GraphProcessResponse {
  geojson: GeoJSON.FeatureCollection;
  stats: GraphProcessingStats;
}

export class GraphProcessingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GraphProcessingError";
  }
}

export class GraphProcessorService {
  private static instance: GraphProcessorService;

  private constructor() {}

  static getInstance(): GraphProcessorService {
    if (!this.instance) {
      this.instance = new GraphProcessorService();
    }
    return this.instance;
  }

  async analyzeGraph(
    geojson: GeoJSON.FeatureCollection,
    maxEdgeLength: number,
  ): Promise<GraphProcessingAnalysis> {
    const res = await fetch("/api/graph/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ geojson, maxEdgeLength }),
    });

    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      throw new GraphProcessingError(payload.error ?? "Falha ao analisar grafo");
    }

    return (await res.json()) as GraphProcessingAnalysis;
  }

  async processGraph(
    geojson: GeoJSON.FeatureCollection,
    options: GraphProcessingOptions,
  ): Promise<GraphProcessResponse> {
    const res = await fetch("/api/graph/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ geojson, options }),
    });

    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      throw new GraphProcessingError(payload.error ?? "Falha ao processar grafo");
    }

    return (await res.json()) as GraphProcessResponse;
  }
}
