/** Types mirroring the Python Pydantic models for the sewer network pipeline. */

export type NodeType = "ROSA" | "VERDE" | "VERMELHO" | "AMARELO" | "AZUL_ESCURO";
export type AccessoryType = "PV";

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
  is_collection_point: boolean;
  accessory_type: AccessoryType | null;
}

export interface SewerEdge {
  id: string;
  source_node_id: string;
  target_node_id: string;
  length_m: number;
  slope: number | null;
  name: string | null;
  highway: string | null;
  waypoints: [number, number][] | null;
}

export interface SewerNetwork {
  project_id: string;
  nodes: SewerNode[];
  edges: SewerEdge[];
  unreachable_nodes: string[];
}
