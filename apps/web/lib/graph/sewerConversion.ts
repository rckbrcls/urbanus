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

  for (const e of network.edges) {
    edges[e.id] = {
      id: e.id,
      sourceId: e.source_node_id,
      targetId: e.target_node_id,
      geometry: e.waypoints ?? [],
      properties: {
        length: e.length_m,
        slope: e.slope,
        streetName: e.name ?? undefined,
        highway: e.highway ?? undefined,
      },
    };
  }

  return { nodes, edges };
}

export function graphToSewerNetwork(
  graph: NetworkGraph,
  projectId: string,
  base?: SewerNetwork | null,
): SewerNetwork {
  const nodes = Object.values(graph.nodes).map((node) => ({
    id: node.id,
    lat: node.coordinates[1],
    lng: node.coordinates[0],
    elevation: Number.isNaN(node.coordinates[2]) ? null : node.coordinates[2],
    node_type: node.properties.nodeType ?? null,
    pv_obrigatorio: node.properties.pvObrigatorio ?? false,
    degree: node.properties.degree ?? node.properties.edgeIds.length,
    is_intersection: node.properties.isIntersection ?? false,
    is_endpoint: node.properties.isEndpoint ?? false,
    is_collection_point: node.properties.isCollectionPoint ?? false,
    accessory_type: node.properties.accessoryType ?? null,
  }));

  const edges = Object.values(graph.edges).map((edge) => ({
    id: edge.id,
    source_node_id: edge.sourceId,
    target_node_id: edge.targetId,
    length_m: edge.properties.length,
    slope: edge.properties.slope ?? null,
    name: edge.properties.streetName ?? null,
    highway: edge.properties.highway ?? null,
    waypoints: edge.geometry.length > 0 ? edge.geometry.map(([lng, lat]) => [lng, lat]) : null,
  }));

  const nodeIds = new Set(nodes.map((node) => node.id));

  return {
    project_id: projectId,
    nodes,
    edges,
    unreachable_nodes: (base?.unreachable_nodes ?? []).filter((nodeId) => nodeIds.has(nodeId)),
  };
}
