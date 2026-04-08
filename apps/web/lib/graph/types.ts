/**
 * Graph data model for the sewer network editor.
 *
 * NetworkGraph is the source of truth during editing. MapNode[] remains
 * the API contract (serialization.ts bridges the two).
 *
 * We use Record<> instead of Map<> because immer cannot proxy Map/Set.
 */

// ============ CORE TYPES ============

export interface NetworkNode {
  id: string;
  /** [lng, lat, elevation] — elevation may be NaN when unknown */
  coordinates: [number, number, number];
  properties: {
    nodeType?: string;
    classification?: string;
    elevation: number | null;
    invertElevation?: number | null;
    rimElevation?: number | null;
    depth?: number | null;
    degree: number;
    edgeIds: string[];
    /** Original MapNode fields kept for round-trip fidelity */
    streetId?: string;
    streetName?: string;
    highway?: string;
    vertexIndex?: number;
    isEndpoint?: boolean;
    isIntersection?: boolean;
    isHighestElevation?: boolean;
    isLowestElevation?: boolean;
    isCollectionPoint?: boolean;
    pvObrigatorio?: boolean;
    accessoryType?: string;
    connectedStreets?: string[];
  };
}

export interface NetworkEdge {
  id: string;
  sourceId: string;
  targetId: string;
  /** Array of [lng, lat] intermediate points (excluding source/target) */
  geometry: number[][];
  properties: {
    length: number;
    slope: number | null;
    material?: string;
    manningN?: number;
    flowDirection?: 'downstream' | 'upstream' | 'unknown';
    upstreamOffset?: number;
    downstreamOffset?: number;
    streetId?: string;
    streetName?: string;
    highway?: string;
  };
}

export interface NetworkGraph {
  nodes: Record<string, NetworkNode>;
  edges: Record<string, NetworkEdge>;
}

// ============ EDITOR TYPES ============

export type EditingMode =
  | 'select'
  | 'add-node'
  | 'add-edge'
  | 'move'
  | 'delete'
  | 'split-edge';

export interface SnapResult {
  type: 'node' | 'street' | 'none';
  nodeId?: string;
  coordinates: [number, number];
}
