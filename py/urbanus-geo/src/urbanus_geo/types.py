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
    MANDATORY = "MANDATORY"      # Structurally preserved or mandatory node
    INTERMEDIATE = "INTERMEDIATE"  # Temporary intermediate node
    REDUNDANT = "REDUNDANT"      # Node marked for removal/merge
    HIGH_POINT = "HIGH_POINT"    # Relevant local elevation maximum
    LOW_POINT = "LOW_POINT"      # Relevant local elevation minimum

    @classmethod
    def _missing_(cls, value: object):
        if not isinstance(value, str):
            return None

        normalized = _LEGACY_NODE_TYPE_ALIASES.get(value)
        if normalized is None:
            return None

        return cls(normalized)


_LEGACY_NODE_TYPE_ALIASES: dict[str, str] = {
    "ROSA": NodeType.MANDATORY.value,
    "VERDE": NodeType.INTERMEDIATE.value,
    "VERMELHO": NodeType.REDUNDANT.value,
    "AMARELO": NodeType.HIGH_POINT.value,
    "AZUL_ESCURO": NodeType.LOW_POINT.value,
}


def normalize_node_type(value: NodeType | str | None) -> NodeType | None:
    if value is None:
        return None
    if isinstance(value, NodeType):
        return value

    try:
        return NodeType(value)
    except ValueError:
        return None


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
    """Serialized result of the current sewer processing pipeline."""
    project_id: str
    nodes: list[SewerNode]
    edges: list[SewerEdge]
    unreachable_nodes: list[str]  # IDs de nós sem gravidade
