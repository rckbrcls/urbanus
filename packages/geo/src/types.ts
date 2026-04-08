/**
 * Core geospatial types — canonical definitions.
 *
 * These are the single source of truth for LatLng, BoundingBox,
 * and validation result types across the JS/TS codebase.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface BoundingBox {
  southWest: LatLng;
  northEast: LatLng;
}

export interface BboxDimensions {
  widthKm: number;
  heightKm: number;
}

export interface ValidationError {
  code: string;
  message: string;
  field?: string;
}

export interface ValidationWarning {
  code: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings?: ValidationWarning[];
}

// --- Sewer domain types ---

export type NodeType =
  | "MANDATORY"
  | "INTERMEDIATE"
  | "REDUNDANT"
  | "HIGH_POINT"
  | "LOW_POINT";
export type AccessoryType = "PV";

export function normalizeNodeType(value: string | null | undefined): NodeType | null {
  switch (value) {
    case "MANDATORY":
    case "ROSA":
      return "MANDATORY";
    case "INTERMEDIATE":
    case "VERDE":
      return "INTERMEDIATE";
    case "REDUNDANT":
    case "VERMELHO":
      return "REDUNDANT";
    case "HIGH_POINT":
    case "AMARELO":
      return "HIGH_POINT";
    case "LOW_POINT":
    case "AZUL_ESCURO":
      return "LOW_POINT";
    default:
      return null;
  }
}

export interface SewerNode {
  id: string;
  lat: number;
  lng: number;
  elevation: number | null;
  nodeType: NodeType | null;
  pvObrigatorio: boolean;
  degree: number;
  isIntersection: boolean;
  isEndpoint: boolean;
  isCollectionPoint: boolean;
  accessoryType: AccessoryType | null;
}

export interface SewerEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  lengthM: number;
  slope: number | null;
  cost: number | null;
  name: string | null;
  highway: string | null;
}

export interface PipeSegment {
  edgeId: string;
  diameterMm: number;
  manningN: number;
  slope: number;
  coverDepth: number;
  flowDepthRatio: number | null;
  velocity: number | null;
  tractiveStress: number | null;
  flowRate: number | null;
  isPressurized: boolean;
}

export interface PumpStation {
  id: string;
  nodeId: string;
  capacityLs: number;
  headM: number;
  capex: number;
  annualOpex: number;
  npv: number | null;
}

export interface SewerNetwork {
  projectId: string;
  nodes: SewerNode[];
  edges: SewerEdge[];
  pipes: PipeSegment[];
  pumpStations: PumpStation[];
  unreachableNodes: string[];
  totalCost: number | null;
}
