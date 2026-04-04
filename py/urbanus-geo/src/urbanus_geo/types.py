from __future__ import annotations

from enum import Enum

from pydantic import BaseModel


class LatLng(BaseModel):
    lat: float
    lng: float


class BoundingBox(BaseModel):
    southWest: LatLng
    northEast: LatLng


# --- Sewer domain models ---


class NodeType(str, Enum):
    ROSA = "ROSA"               # PV obrigatório (interseção, confluência)
    VERDE = "VERDE"             # Intermediário (subdivisão de aresta longa)
    VERMELHO = "VERMELHO"       # Redundante (será removido)
    AMARELO = "AMARELO"         # Ponto alto (início de rede)
    AZUL_ESCURO = "AZUL_ESCURO" # Ponto baixo (problemático)


class AccessoryType(str, Enum):
    PV = "PV"     # Poço de Visita
    TIL = "TIL"   # Terminal de Inspeção e Limpeza
    TL = "TL"     # Terminal de Limpeza
    CP = "CP"     # Caixa de Passagem


class SewerNode(BaseModel):
    id: str
    lat: float
    lng: float
    elevation: float | None = None
    node_type: NodeType | None = None
    pv_obrigatorio: bool = False
    degree: int = 0
    is_intersection: bool = False
    is_endpoint: bool = False
    is_collection_point: bool = False
    accessory_type: AccessoryType | None = None


class SewerEdge(BaseModel):
    id: str
    source_node_id: str
    target_node_id: str
    length_m: float
    slope: float | None = None   # m/m (positivo = desce na direção do fluxo)
    cost: float | None = None
    name: str | None = None
    highway: str | None = None
    waypoints: list[list[float]] | None = None  # [[lng, lat], ...] intermediate points


class PipeSegment(BaseModel):
    edge_id: str
    diameter_mm: int = 150       # DN
    manning_n: float = 0.013
    slope: float                 # m/m
    cover_depth: float           # m (recobrimento)
    flow_depth_ratio: float | None = None  # y/D
    velocity: float | None = None          # m/s
    tractive_stress: float | None = None   # Pa
    flow_rate: float | None = None         # L/s
    is_pressurized: bool = False           # True = elevatória


class PumpStation(BaseModel):
    id: str
    node_id: str
    capacity_ls: float     # L/s
    head_m: float          # m
    capex: float           # R$
    annual_opex: float     # R$
    npv: float | None = None  # VPL calculado


class SewerNetwork(BaseModel):
    """Resultado completo do pipeline de 8 etapas."""
    project_id: str
    nodes: list[SewerNode]
    edges: list[SewerEdge]
    pipes: list[PipeSegment]
    pump_stations: list[PumpStation]
    unreachable_nodes: list[str]  # IDs de nós sem gravidade
    total_cost: float | None = None
