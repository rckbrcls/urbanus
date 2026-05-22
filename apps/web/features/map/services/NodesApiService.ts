/**
 * Serviço de API para extração de nós via backend
 *
 * Chama POST /api/nodes/extract (proxy Next.js → FastAPI)
 * e converte a resposta para MapNode[] com defaults de UI.
 */

import type { MapNode, NodesExtractResponse } from "../types/node.types";
import type { EnrichedFeatureCollection } from "../types/elevation.types";

export type NodesExtractMode = "intersections" | "all";

export interface NodesApiResult {
  nodes: MapNode[];
  metadata: NodesExtractResponse["metadata"];
}

export class NodesApiService {
  private static instance: NodesApiService;

  private constructor() {}

  static getInstance(): NodesApiService {
    if (!this.instance) {
      this.instance = new NodesApiService();
    }
    return this.instance;
  }

  /**
   * Extrai nós via backend Python.
   *
   * @param mode "intersections" → apenas grau >= 2 (para preview)
   *             "all" → todos os vértices por rua (para edição)
   */
  async extractNodes(
    geojson: EnrichedFeatureCollection,
    mode: NodesExtractMode = "intersections",
  ): Promise<NodesApiResult> {
    const res = await fetch("/api/nodes/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ geojson, mode }),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as {
        error?: string;
        details?: string;
      };
      throw new Error(err.error ?? err.details ?? "Failed to extract nodes");
    }

    const data: NodesExtractResponse = await res.json();
    const now = Date.now();

    const nodes: MapNode[] = data.nodes.map((n) => ({
      id: n.id,
      position: n.position,
      elevation: n.elevation,
      streetId: n.streetId,
      streetName: n.streetName,
      highway: n.highway ?? undefined,
      vertexIndex: n.vertexIndex,
      isEndpoint: n.isEndpoint,
      isIntersection: n.isIntersection,
      connectedStreets: n.connectedStreets,
      degree: n.degree,
      isHighestElevation: n.isHighestElevation,
      isLowestElevation: n.isLowestElevation,
      isSelected: false,
      isHovered: false,
      isDragging: false,
      isLocked: false,
      createdAt: now,
      updatedAt: now,
    }));

    return { nodes, metadata: data.metadata };
  }
}
