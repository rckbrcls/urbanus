/**
 * Pure functions for graph analysis and validation.
 *
 * No side effects — these operate on NetworkGraph and return derived data.
 */

import type { NetworkGraph, NetworkNode, NetworkEdge } from './types';
import { HYDRAULICS } from '@urbanus/constants';
import { GeoCalculations } from '@urbanus/geo';

// ============ ADJACENCY ============

export interface AdjacencyMaps {
  /** nodeId → Set of connected nodeIds */
  adjacency: Record<string, string[]>;
  /** nodeId → edgeIds going out from this node */
  outgoing: Record<string, string[]>;
  /** nodeId → edgeIds coming into this node */
  incoming: Record<string, string[]>;
}

export function buildAdjacency(graph: NetworkGraph): AdjacencyMaps {
  const adjacency: Record<string, string[]> = {};
  const outgoing: Record<string, string[]> = {};
  const incoming: Record<string, string[]> = {};

  // Initialize
  for (const nodeId of Object.keys(graph.nodes)) {
    adjacency[nodeId] = [];
    outgoing[nodeId] = [];
    incoming[nodeId] = [];
  }

  for (const edge of Object.values(graph.edges)) {
    // Undirected adjacency
    adjacency[edge.sourceId]?.push(edge.targetId);
    adjacency[edge.targetId]?.push(edge.sourceId);

    // Directed
    outgoing[edge.sourceId]?.push(edge.id);
    incoming[edge.targetId]?.push(edge.id);
  }

  return { adjacency, outgoing, incoming };
}

// ============ SLOPE ============

/**
 * Calculate slope between two nodes.
 * Positive slope = downhill from source to target.
 */
export function calculateSlope(
  source: NetworkNode,
  target: NetworkNode,
  length: number,
): number | null {
  const zSource = source.coordinates[2];
  const zTarget = target.coordinates[2];

  if (isNaN(zSource) || isNaN(zTarget) || length <= 0) return null;

  return (zSource - zTarget) / length;
}

/**
 * Validate slope against shared hydraulic thresholds.
 */
export function validateSlope(
  slope: number | null,
  diameterMm: number = HYDRAULICS.MIN_DIAMETER_COLLECTOR,
): { valid: boolean; reason?: string } {
  if (slope === null) return { valid: true }; // Can't validate without data

  // Min slope (tractive stress constraint) — simplified approximation
  // Real formula uses Manning + hydraulic radius, but for quick validation:
  const minSlope = 0.005; // 0.5% — safe minimum for DN150+

  if (slope < -0.001) {
    return { valid: false, reason: `Adverse slope (${(slope * 100).toFixed(2)}%)` };
  }

  if (slope < minSlope && slope >= 0) {
    return {
      valid: false,
      reason: `Slope too low (${(slope * 100).toFixed(2)}%) for DN${diameterMm}`,
    };
  }

  return { valid: true };
}

// ============ ORPHAN DETECTION ============

/**
 * Find nodes not reachable from any outlet (node with outgoing edges but no incoming).
 * Uses BFS from outlets, traversing edges in reverse.
 */
export function findOrphanNodes(graph: NetworkGraph): string[] {
  const { adjacency } = buildAdjacency(graph);
  const allNodeIds = Object.keys(graph.nodes);

  if (allNodeIds.length === 0) return [];

  // Find outlet candidates: lowest-elevation nodes or nodes with degree 1
  const outlets: string[] = [];
  for (const node of Object.values(graph.nodes)) {
    if (node.properties.isLowestElevation || node.properties.degree <= 1) {
      outlets.push(node.id);
    }
  }

  // If no explicit outlets, use the node with lowest elevation
  if (outlets.length === 0) {
    let lowestId = allNodeIds[0];
    let lowestElev = Infinity;
    for (const node of Object.values(graph.nodes)) {
      const elev = node.coordinates[2];
      if (!isNaN(elev) && elev < lowestElev) {
        lowestElev = elev;
        lowestId = node.id;
      }
    }
    outlets.push(lowestId);
  }

  // BFS from outlets (undirected)
  const visited = new Set<string>(outlets);
  const queue = [...outlets];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const neighbor of adjacency[current] ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  return allNodeIds.filter((id) => !visited.has(id));
}

// ============ CONNECTED EDGES ============

/**
 * Get all edges connected to a node.
 */
export function getConnectedEdges(graph: NetworkGraph, nodeId: string): NetworkEdge[] {
  return Object.values(graph.edges).filter(
    (e) => e.sourceId === nodeId || e.targetId === nodeId,
  );
}

// ============ EDGE LENGTH ============

/**
 * Calculate edge length in meters using Haversine.
 */
export function calculateEdgeLength(
  source: NetworkNode,
  target: NetworkNode,
  intermediatePoints: number[][] = [],
): number {
  const points: { lat: number; lng: number }[] = [
    { lat: source.coordinates[1], lng: source.coordinates[0] },
    ...intermediatePoints.map(([lng, lat]) => ({ lat, lng })),
    { lat: target.coordinates[1], lng: target.coordinates[0] },
  ];

  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += GeoCalculations.calculateDistance(points[i - 1], points[i]);
  }

  return total;
}
