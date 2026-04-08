/**
 * Sewer-specific graph analysis functions.
 *
 * Sewer graph analysis helpers.
 */

import type { NetworkGraph } from './types';
import { buildAdjacency } from './operations';

/**
 * Calculate slope using SWMM convention:
 *   slope = (z_upstream - z_downstream) / length
 *   Positive = flowing downhill (gravity-compatible).
 */
export function calculateSWMMSlope(
  upstreamElev: number | null,
  downstreamElev: number | null,
  length: number,
): number | null {
  if (upstreamElev === null || downstreamElev === null || length <= 0) return null;
  return (upstreamElev - downstreamElev) / length;
}

/**
 * Validate slope against shared hydraulic thresholds.
 * Returns array of warnings/errors.
 */
export function validateSlopeConstraints(
  slope: number | null,
): { valid: boolean; warnings: string[] } {
  if (slope === null) return { valid: true, warnings: ['No elevation data'] };

  const warnings: string[] = [];

  // Adverse slope (water would flow uphill)
  if (slope < 0) {
    return {
      valid: false,
      warnings: [`Adverse slope: ${(slope * 100).toFixed(2)}%`],
    };
  }

  const minSlope = 0.005;

  if (slope < minSlope) {
    warnings.push(
      `Slope ${(slope * 100).toFixed(3)}% below minimum ${(minSlope * 100).toFixed(3)}%`,
    );
    return { valid: false, warnings };
  }

  return { valid: true, warnings };
}

/**
 * Find nodes not reachable from outlets via BFS.
 * An orphan cannot drain by gravity.
 */
export function findOrphanNodes(graph: NetworkGraph): string[] {
  const { adjacency } = buildAdjacency(graph);
  const allIds = Object.keys(graph.nodes);
  if (allIds.length === 0) return [];

  // Find outlets: nodes marked as lowest elevation, or degree-1 at lowest point
  const outlets: string[] = [];
  for (const node of Object.values(graph.nodes)) {
    if (node.properties.isLowestElevation) {
      outlets.push(node.id);
    }
  }

  if (outlets.length === 0) {
    // Fallback: lowest-elevation node
    let lowestId = allIds[0];
    let lowestElev = Infinity;
    for (const node of Object.values(graph.nodes)) {
      const e = node.coordinates[2];
      if (!isNaN(e) && e < lowestElev) {
        lowestElev = e;
        lowestId = node.id;
      }
    }
    outlets.push(lowestId);
  }

  // BFS
  const visited = new Set(outlets);
  const queue = [...outlets];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const neighbor of adjacency[cur] ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  return allIds.filter((id) => !visited.has(id));
}

/**
 * Assign flow direction to edges based on elevation.
 * Flow goes from higher to lower elevation (gravity).
 */
export function assignFlowDirection(graph: NetworkGraph): NetworkGraph {
  const updated = { ...graph, edges: { ...graph.edges } };

  for (const [edgeId, edge] of Object.entries(updated.edges)) {
    const source = graph.nodes[edge.sourceId];
    const target = graph.nodes[edge.targetId];

    if (!source || !target) continue;

    const zSource = source.coordinates[2];
    const zTarget = target.coordinates[2];

    let direction: 'downstream' | 'upstream' | 'unknown' = 'unknown';
    if (!isNaN(zSource) && !isNaN(zTarget)) {
      direction = zSource >= zTarget ? 'downstream' : 'upstream';
    }

    updated.edges[edgeId] = {
      ...edge,
      properties: { ...edge.properties, flowDirection: direction },
    };
  }

  return updated;
}
