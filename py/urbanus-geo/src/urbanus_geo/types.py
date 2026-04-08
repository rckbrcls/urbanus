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
    name: str | None = None
    highway: str | None = None
    waypoints: list[list[float]] | None = None  # [[lng, lat], ...] intermediate points


class SewerNetwork(BaseModel):
    """Resultado completo do pipeline de 8 etapas."""
    project_id: str
    nodes: list[SewerNode]
    edges: list[SewerEdge]
    unreachable_nodes: list[str]  # IDs de nós sem gravidade
