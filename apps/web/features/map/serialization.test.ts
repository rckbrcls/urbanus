import { describe, expect, it } from "vitest";

import { mapNodesToNetworkGraph } from "@/lib/graph/serialization";
import type { MapNode } from "./types/node.types";

function makeNode(overrides: Partial<MapNode> = {}): MapNode {
  return {
    id: "node-1",
    position: { lat: -23.55, lng: -46.65 },
    elevation: null,
    streetId: "street-1",
    streetName: "Street 1",
    vertexIndex: 0,
    isEndpoint: true,
    isIntersection: false,
    connectedStreets: ["street-1"],
    degree: 1,
    isHighestElevation: false,
    isLowestElevation: false,
    isSelected: false,
    isHovered: false,
    isDragging: false,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("mapNodesToNetworkGraph", () => {
  it("prefers valid elevation over zero for coincident nodes", () => {
    const nodes: MapNode[] = [
      makeNode({
        id: "zero-node",
        elevation: 0,
        streetId: "street-a",
        streetName: "Street A",
        connectedStreets: ["street-a"],
      }),
      makeNode({
        id: "valid-node",
        elevation: 852,
        streetId: "street-b",
        streetName: "Street B",
        connectedStreets: ["street-b"],
        isIntersection: true,
        degree: 2,
      }),
      makeNode({
        id: "neighbor-a",
        position: { lat: -23.55, lng: -46.649 },
        elevation: 846,
        streetId: "street-a",
        streetName: "Street A",
        connectedStreets: ["street-a"],
      }),
      makeNode({
        id: "neighbor-b",
        position: { lat: -23.549, lng: -46.65 },
        elevation: 840,
        streetId: "street-b",
        streetName: "Street B",
        connectedStreets: ["street-b"],
      }),
    ];

    const graph = mapNodesToNetworkGraph(nodes);
    const canonicalNode = graph.nodes["zero-node"];

    expect(canonicalNode).toBeDefined();
    expect(canonicalNode.properties.elevation).toBe(852);
    expect(canonicalNode.coordinates[2]).toBe(852);
    expect(canonicalNode.properties.isIntersection).toBe(true);
  });
});
