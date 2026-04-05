/**
 * Serialization: bridge between MapNode[] (API contract) and NetworkGraph (editor model).
 *
 * MapNode is vertex-per-street — a single physical intersection may appear
 * as multiple MapNodes (one per street). NetworkGraph collapses these into
 * unique nodes by position and builds edges between adjacent anchors.
 */

import { GeoCalculations } from '@urbanus/geo';
import type { MapNode } from '@/features/map/types/node.types';
import type { NetworkGraph, NetworkNode, NetworkEdge } from './types';
import { calculateSlope } from './operations';

// ============ MapNode[] → NetworkGraph ============

/**
 * Convert extracted MapNodes (from the API) into a NetworkGraph.
 *
 * Strategy:
 * 1. Group nodes by position (rounded to ~1m precision) to deduplicate.
 * 2. Within each street, connect consecutive anchor nodes (intersections + endpoints)
 *    as edges.
 */
export function mapNodesToNetworkGraph(nodes: MapNode[]): NetworkGraph {
  const graph: NetworkGraph = { nodes: {}, edges: {} };

  // Position key → canonical node id (dedup by ~1m precision)
  const positionMap = new Map<string, string>();

  function posKey(lat: number, lng: number): string {
    return `${lat.toFixed(5)},${lng.toFixed(5)}`;
  }

  // Group nodes by ALL connected streets (not just primary streetId).
  // After backend clustering, a merged node keeps only one streetId but
  // connectedStreets lists every street it belongs to. Using connectedStreets
  // ensures every street gets its intersection nodes back.
  function streetsOf(mn: MapNode): string[] {
    const streets = mn.connectedStreets?.length ? [...mn.connectedStreets] : [];
    if (!streets.includes(mn.streetId)) streets.push(mn.streetId);
    return streets;
  }

  // Pre-compute street endpoint positions (geographic extremes per street)
  const streetEndpointKeys = new Set<string>();
  {
    const byStreet = new Map<string, MapNode[]>();
    for (const mn of nodes) {
      for (const sid of streetsOf(mn)) {
        const arr = byStreet.get(sid) || [];
        arr.push(mn);
        byStreet.set(sid, arr);
      }
    }
    for (const streetNodes of byStreet.values()) {
      if (streetNodes.length < 2) continue;
      // Use geographic extremes as endpoints (vertexIndex may be
      // from a different street after clustering)
      const lats = streetNodes.map((n) => n.position.lat);
      const lngs = streetNodes.map((n) => n.position.lng);
      const latSpan = Math.max(...lats) - Math.min(...lats);
      const lngSpan = Math.max(...lngs) - Math.min(...lngs);
      const sorted = [...streetNodes].sort((a, b) =>
        lngSpan >= latSpan
          ? a.position.lng - b.position.lng || a.position.lat - b.position.lat
          : a.position.lat - b.position.lat || a.position.lng - b.position.lng,
      );
      streetEndpointKeys.add(posKey(sorted[0].position.lat, sorted[0].position.lng));
      streetEndpointKeys.add(posKey(sorted[sorted.length - 1].position.lat, sorted[sorted.length - 1].position.lng));
    }
  }

  function isAnchorNode(mn: MapNode): boolean {
    return Boolean(
      (mn.degree && mn.degree >= 2) ||
      mn.isEndpoint ||
      streetEndpointKeys.has(posKey(mn.position.lat, mn.position.lng)),
    );
  }

  // 1. Create unique nodes
  for (const mn of nodes) {
    const key = posKey(mn.position.lat, mn.position.lng);
    if (!isAnchorNode(mn)) continue;

    if (!positionMap.has(key)) {
      const id = mn.id;
      positionMap.set(key, id);

      const networkNode: NetworkNode = {
        id,
        coordinates: [mn.position.lng, mn.position.lat, mn.elevation ?? NaN],
        properties: {
          nodeType: mn.nodeType,
          elevation: mn.elevation,
          degree: mn.degree ?? 0,
          edgeIds: [],
          streetId: mn.streetId,
          streetName: mn.streetName,
          highway: mn.highway,
          vertexIndex: mn.vertexIndex,
          isEndpoint: mn.isEndpoint,
          isIntersection: mn.isIntersection,
          isHighestElevation: mn.isHighestElevation,
          isLowestElevation: mn.isLowestElevation,
          connectedStreets: mn.connectedStreets,
        },
      };
      graph.nodes[id] = networkNode;
    }
  }

  // 2. Build edges per street (connect consecutive anchors)
  // Group by connectedStreets so clustered nodes appear in all their streets
  const nodesByStreet = new Map<string, MapNode[]>();
  for (const mn of nodes) {
    for (const sid of streetsOf(mn)) {
      const arr = nodesByStreet.get(sid) || [];
      arr.push(mn);
      nodesByStreet.set(sid, arr);
    }
  }

  for (const [streetId, streetNodes] of nodesByStreet) {
    // Deduplicate by position (same position can appear from multiple MapNodes)
    const seenPos = new Set<string>();
    const unique = streetNodes.filter((n) => {
      const key = posKey(n.position.lat, n.position.lng);
      if (seenPos.has(key)) return false;
      seenPos.add(key);
      return true;
    });

    if (unique.length < 2) continue;

    // Sort geographically along the street's dominant axis.
    // vertexIndex is unreliable for cross-street nodes after clustering.
    const lats = unique.map((n) => n.position.lat);
    const lngs = unique.map((n) => n.position.lng);
    const latSpan = Math.max(...lats) - Math.min(...lats);
    const lngSpan = Math.max(...lngs) - Math.min(...lngs);

    const sorted = [...unique].sort((a, b) =>
      lngSpan >= latSpan
        ? a.position.lng - b.position.lng || a.position.lat - b.position.lat
        : a.position.lat - b.position.lat || a.position.lng - b.position.lng,
    );

    // Find anchors in order (intersections + endpoints + street endpoints)
    const anchors = sorted.filter((n) => isAnchorNode(n));

    for (let i = 0; i < anchors.length - 1; i++) {
      const srcNode = anchors[i];
      const tgtNode = anchors[i + 1];

      const srcKey = posKey(srcNode.position.lat, srcNode.position.lng);
      const tgtKey = posKey(tgtNode.position.lat, tgtNode.position.lng);

      const sourceId = positionMap.get(srcKey);
      const targetId = positionMap.get(tgtKey);
      if (!sourceId || !targetId || sourceId === targetId) continue;

      const source = graph.nodes[sourceId];
      const target = graph.nodes[targetId];
      if (!source || !target) continue;

      const length = GeoCalculations.calculateDistance(
        srcNode.position,
        tgtNode.position,
      );

      const slope = calculateSlope(source, target, length);

      const edgeId = `${sourceId}::${targetId}`;
      if (graph.edges[edgeId]) continue; // skip duplicate (same pair from another street)
      const edge: NetworkEdge = {
        id: edgeId,
        sourceId,
        targetId,
        geometry: [], // Direct line (no intermediate vertices)
        properties: {
          length,
          slope,
          streetId,
          streetName: srcNode.streetName,
          highway: srcNode.highway,
        },
      };

      graph.edges[edgeId] = edge;
      source.properties.edgeIds.push(edgeId);
      target.properties.edgeIds.push(edgeId);
    }
  }

  // Safety net: remove nodes with zero edges and orphan edges
  for (const [id, node] of Object.entries(graph.nodes)) {
    if (node.properties.edgeIds.length === 0) {
      delete graph.nodes[id];
    }
  }
  for (const [eid, edge] of Object.entries(graph.edges)) {
    if (!graph.nodes[edge.sourceId] || !graph.nodes[edge.targetId]) {
      delete graph.edges[eid];
    }
  }

  return graph;
}

// ============ NetworkGraph → GeoJSON ============

export interface GraphGeoJSON {
  nodesFC: GeoJSON.FeatureCollection;
  edgesFC: GeoJSON.FeatureCollection;
}

export function networkGraphToGeoJSON(graph: NetworkGraph): GraphGeoJSON {
  const nodesFC: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: Object.values(graph.nodes).map((n) => ({
      type: 'Feature' as const,
      id: n.id,
      properties: {
        id: n.id,
        ...n.properties,
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [n.coordinates[0], n.coordinates[1]],
      },
    })),
  };

  const edgesFC: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: Object.values(graph.edges).map((e) => {
      const source = graph.nodes[e.sourceId];
      const target = graph.nodes[e.targetId];
      if (!source || !target) {
        return null;
      }

      const coordinates: number[][] = [
        [source.coordinates[0], source.coordinates[1]],
        ...e.geometry,
        [target.coordinates[0], target.coordinates[1]],
      ];

      return {
        type: 'Feature' as const,
        id: e.id,
        properties: {
          id: e.id,
          sourceId: e.sourceId,
          targetId: e.targetId,
          ...e.properties,
        },
        geometry: {
          type: 'LineString' as const,
          coordinates,
        },
      };
    }).filter(Boolean) as GeoJSON.Feature[],
  };

  return { nodesFC, edgesFC };
}

// ============ NetworkGraph → MapNode[] (for API round-trip) ============

export function networkGraphToMapNodes(graph: NetworkGraph): MapNode[] {
  const now = Date.now();

  return Object.values(graph.nodes).map((n) => ({
    id: n.id,
    position: { lat: n.coordinates[1], lng: n.coordinates[0] },
    elevation: n.properties.elevation,
    streetId: n.properties.streetId ?? '',
    streetName: n.properties.streetName,
    highway: n.properties.highway,
    vertexIndex: n.properties.vertexIndex ?? 0,
    isEndpoint: n.properties.isEndpoint ?? false,
    isIntersection: n.properties.isIntersection,
    connectedStreets: n.properties.connectedStreets,
    degree: n.properties.degree,
    isHighestElevation: n.properties.isHighestElevation,
    isLowestElevation: n.properties.isLowestElevation,
    nodeType: n.properties.nodeType as MapNode['nodeType'],
    isSelected: false,
    isHovered: false,
    isDragging: false,
    isLocked: false,
    createdAt: now,
    updatedAt: now,
  }));
}
