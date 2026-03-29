import { describe, it, expect } from "vitest";
import { NodeValidator } from "./NodeValidator";
import type { MapNode } from "../types/node.types";
import type { BoundingBox, LatLng } from "@urbanus/geo";

const validator = new NodeValidator();

const bbox: BoundingBox = {
  southWest: { lat: -23.60, lng: -46.70 },
  northEast: { lat: -23.50, lng: -46.60 },
};

function makeNode(overrides: Partial<MapNode> = {}): MapNode {
  return {
    id: "node-1",
    position: { lat: -23.55, lng: -46.65 },
    elevation: 750,
    streetId: "street-1",
    vertexIndex: 0,
    isEndpoint: false,
    isSelected: false,
    isHovered: false,
    isDragging: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe("NodeValidator", () => {
  describe("isInsideBbox", () => {
    it("inside → true", () => {
      expect(validator.isInsideBbox({ lat: -23.55, lng: -46.65 }, bbox)).toBe(true);
    });

    it("outside → false", () => {
      expect(validator.isInsideBbox({ lat: -23.40, lng: -46.65 }, bbox)).toBe(false);
    });

    it("border → true", () => {
      expect(validator.isInsideBbox({ lat: -23.60, lng: -46.70 }, bbox)).toBe(true);
    });
  });

  describe("validateMove", () => {
    it("locked node → NODE_LOCKED", () => {
      const node = makeNode({ isLocked: true });
      const result = validator.validateMove(node, { lat: -23.54, lng: -46.64 }, [], bbox);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe("NODE_LOCKED");
    });

    it("outside bbox → OUTSIDE_BOUNDS", () => {
      const node = makeNode();
      const result = validator.validateMove(node, { lat: -23.40, lng: -46.65 }, [], bbox);
      expect(result.errors.some((e) => e.code === "OUTSIDE_BOUNDS")).toBe(true);
    });

    it("too close to another node → TOO_CLOSE warning", () => {
      const node = makeNode({ id: "node-1" });
      const other = makeNode({
        id: "node-2",
        position: { lat: -23.5500, lng: -46.6500 },
      });
      // Move node-1 to basically same position as node-2
      const result = validator.validateMove(
        node,
        { lat: -23.5500, lng: -46.6500 },
        [node, other],
        bbox
      );
      expect(result.warnings.some((w) => w.code === "TOO_CLOSE")).toBe(true);
    });

    it("valid move → valid", () => {
      const node = makeNode();
      const result = validator.validateMove(node, { lat: -23.54, lng: -46.64 }, [node], bbox);
      expect(result.valid).toBe(true);
    });

    it("intersection node → INTERSECTION_MODIFIED warning", () => {
      const node = makeNode({ isIntersection: true });
      const result = validator.validateMove(node, { lat: -23.54, lng: -46.64 }, [node], bbox);
      expect(result.warnings.some((w) => w.code === "INTERSECTION_MODIFIED")).toBe(true);
    });
  });

  describe("validateDelete", () => {
    it("locked → invalid", () => {
      const node = makeNode({ isLocked: true });
      const result = validator.validateDelete(node);
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe("NODE_LOCKED");
    });

    it("endpoint → invalid", () => {
      const node = makeNode({ isEndpoint: true });
      const result = validator.validateDelete(node);
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe("CANNOT_DELETE_ENDPOINT");
    });

    it("normal node → valid", () => {
      const node = makeNode();
      expect(validator.validateDelete(node).valid).toBe(true);
    });
  });

  describe("validateCreate", () => {
    it("outside bbox → OUTSIDE_BOUNDS", () => {
      const result = validator.validateCreate({ lat: -23.40, lng: -46.65 }, [], bbox);
      expect(result.errors.some((e) => e.code === "OUTSIDE_BOUNDS")).toBe(true);
    });

    it("too close to existing → INVALID_POSITION", () => {
      const existing = makeNode({ position: { lat: -23.55, lng: -46.65 } });
      const result = validator.validateCreate({ lat: -23.55, lng: -46.65 }, [existing], bbox);
      expect(result.errors.some((e) => e.code === "INVALID_POSITION")).toBe(true);
    });

    it("valid position → valid", () => {
      const result = validator.validateCreate({ lat: -23.55, lng: -46.65 }, [], bbox);
      expect(result.valid).toBe(true);
    });
  });

  describe("findNearestNode", () => {
    it("returns closest node excluding self", () => {
      const nodes = [
        makeNode({ id: "a", position: { lat: -23.55, lng: -46.65 } }),
        makeNode({ id: "b", position: { lat: -23.551, lng: -46.65 } }),
        makeNode({ id: "c", position: { lat: -23.56, lng: -46.65 } }),
      ];
      const nearest = validator.findNearestNode({ lat: -23.55, lng: -46.65 }, nodes, "a");
      expect(nearest?.id).toBe("b");
    });

    it("excludes self", () => {
      const nodes = [makeNode({ id: "a", position: { lat: -23.55, lng: -46.65 } })];
      const nearest = validator.findNearestNode({ lat: -23.55, lng: -46.65 }, nodes, "a");
      expect(nearest).toBeNull();
    });
  });

  describe("findNodesNear", () => {
    it("returns nodes within radius", () => {
      const nodes = [
        makeNode({ id: "a", position: { lat: -23.55, lng: -46.65 } }),
        makeNode({ id: "b", position: { lat: -23.5501, lng: -46.65 } }),
        makeNode({ id: "c", position: { lat: -23.58, lng: -46.65 } }),
      ];
      const near = validator.findNodesNear({ lat: -23.55, lng: -46.65 }, nodes, 50);
      expect(near.length).toBe(2); // a and b are within 50m
    });

    it("excludes specified id", () => {
      const nodes = [
        makeNode({ id: "a", position: { lat: -23.55, lng: -46.65 } }),
        makeNode({ id: "b", position: { lat: -23.5501, lng: -46.65 } }),
      ];
      const near = validator.findNodesNear({ lat: -23.55, lng: -46.65 }, nodes, 50, "a");
      expect(near.length).toBe(1);
      expect(near[0].id).toBe("b");
    });
  });
});
