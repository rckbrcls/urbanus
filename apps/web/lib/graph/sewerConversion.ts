/**
 * Converts a processed SewerNetwork back into the graph editor format
 * so the same editor works before and after processing.
 */

import type { SewerNetwork } from '@/types/sewer';
import type { NetworkNode, NetworkEdge, NetworkGraph } from './types';

export function sewerNetworkToGraph(network: SewerNetwork): NetworkGraph {
  const nodes: Record<string, NetworkNode> = {};
  const edges: Record<string, NetworkEdge> = {};

  // Build edge lookup per node for edgeIds
  const nodeEdgeIds: Record<string, string[]> = {};

  for (const e of network.edges) {
    const edgeId = e.id;
    nodeEdgeIds[e.source_node_id] ??= [];
    nodeEdgeIds[e.source_node_id].push(edgeId);
    nodeEdgeIds[e.target_node_id] ??= [];
    nodeEdgeIds[e.target_node_id].push(edgeId);
  }

  for (const n of network.nodes) {
    nodes[n.id] = {
      id: n.id,
      coordinates: [n.lng, n.lat, n.elevation ?? NaN],
      properties: {
        nodeType: n.node_type ?? undefined,
        elevation: n.elevation,
        degree: n.degree,
        edgeIds: nodeEdgeIds[n.id] ?? [],
        isEndpoint: n.is_endpoint,
        isIntersection: n.is_intersection,
        isCollectionPoint: n.is_collection_point,
        pvObrigatorio: n.pv_obrigatorio,
        accessoryType: n.accessory_type ?? undefined,
      },
    };
  }

  const pipeLookup = new Map(
    network.pipes.map((p) => [p.edge_id, p]),
  );

  for (const e of network.edges) {
    const pipe = pipeLookup.get(e.id) ?? pipeLookup.get(`${e.source_node_id}->${e.target_node_id}`);

    edges[e.id] = {
      id: e.id,
      sourceId: e.source_node_id,
      targetId: e.target_node_id,
      geometry: e.waypoints ?? [],
      properties: {
        length: e.length_m,
        slope: e.slope,
        diameter: pipe?.diameter_mm,
        streetName: e.name ?? undefined,
        highway: e.highway ?? undefined,
      },
    };
  }

  return { nodes, edges };
}
