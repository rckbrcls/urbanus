/** Types mirroring the Python Pydantic models for the sewer network pipeline. */

export type NodeType = "ROSA" | "VERDE" | "VERMELHO" | "AMARELO" | "AZUL_ESCURO";
export type AccessoryType = "PV" | "TIL" | "TL" | "CP";

export interface SewerNode {
  id: string;
  lat: number;
  lng: number;
  elevation: number | null;
  node_type: NodeType | null;
  pv_obrigatorio: boolean;
  degree: number;
  is_intersection: boolean;
  is_endpoint: boolean;
  accessory_type: AccessoryType | null;
}

export interface SewerEdge {
  id: string;
  source_node_id: string;
  target_node_id: string;
  length_m: number;
  slope: number | null;
  cost: number | null;
  name: string | null;
  highway: string | null;
}

export interface PipeSegment {
  edge_id: string;
  diameter_mm: number;
  manning_n: number;
  slope: number;
  cover_depth: number;
  flow_depth_ratio: number | null;
  velocity: number | null;
  tractive_stress: number | null;
  flow_rate: number | null;
  is_pressurized: boolean;
}

export interface PumpStation {
  id: string;
  node_id: string;
  capacity_ls: number;
  head_m: number;
  capex: number;
  annual_opex: number;
  npv: number | null;
}

export interface SewerNetwork {
  project_id: string;
  nodes: SewerNode[];
  edges: SewerEdge[];
  pipes: PipeSegment[];
  pump_stations: PumpStation[];
  unreachable_nodes: string[];
  total_cost: number | null;
}
