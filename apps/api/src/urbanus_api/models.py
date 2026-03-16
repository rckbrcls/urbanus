"""Pydantic models for the URBANUS API."""

from typing import List, Dict, Any, Optional, Literal

from pydantic import BaseModel
from urbanus_geo.types import LatLng, BoundingBox


class ProjectStats(BaseModel):
    streetCount: int


class Project(BaseModel):
    id: str
    name: str
    createdAt: int
    bounds: BoundingBox
    areaKm2: float
    center: List[float]
    zoom: float
    stats: ProjectStats
    streets: Dict[str, Any]


class NodesExtractRequest(BaseModel):
    geojson: Dict[str, Any]
    mode: Literal["intersections", "all"] = "intersections"


class ElevationEnrichBbox(BaseModel):
    south: float
    north: float
    west: float
    east: float


class ElevationEnrichRequest(BaseModel):
    geojson: Dict[str, Any]
    bbox: ElevationEnrichBbox
    demType: Optional[str] = "COP30"
