"""SQLAlchemy ORM models with PostGIS geometry columns."""

from __future__ import annotations

from sqlalchemy import (
    Boolean,
    Column,
    Double,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    BigInteger,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, relationship
from geoalchemy2 import Geometry


class Base(DeclarativeBase):
    pass


class ProjectTable(Base):
    __tablename__ = "projects"

    id = Column(String, primary_key=True)
    name = Column(Text, nullable=False)
    created_at = Column(BigInteger, nullable=False)
    bounds = Column(Geometry("POLYGON", srid=4326))
    area_km2 = Column(Double, nullable=False)
    center = Column(Geometry("POINT", srid=4326))
    zoom = Column(Double, nullable=False)
    street_count = Column(Integer, nullable=False, default=0)
    streets_geojson = Column(JSONB)

    edges = relationship("EdgeTable", back_populates="project", cascade="all, delete-orphan")
    nodes = relationship("NodeTable", back_populates="project", cascade="all, delete-orphan")
    pipe_segments = relationship("PipeSegmentTable", back_populates="project", cascade="all, delete-orphan")
    pump_stations = relationship("PumpStationTable", back_populates="project", cascade="all, delete-orphan")


class EdgeTable(Base):
    __tablename__ = "edges"

    id = Column(String, primary_key=True)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    geometry = Column(Geometry("LINESTRING", srid=4326), nullable=False)
    name = Column(Text)
    highway = Column(Text)
    length_m = Column(Double)
    slope = Column(Double)
    cost = Column(Double)
    properties = Column(JSONB)

    project = relationship("ProjectTable", back_populates="edges")

    __table_args__ = (
        Index("idx_edges_project", "project_id"),
        Index("idx_edges_geom", "geometry", postgresql_using="gist"),
    )


class NodeTable(Base):
    __tablename__ = "nodes"

    id = Column(String, primary_key=True)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    geometry = Column(Geometry("POINT", srid=4326), nullable=False)
    elevation = Column(Double)
    degree = Column(Integer)
    is_intersection = Column(Boolean, default=False)
    is_endpoint = Column(Boolean, default=False)
    node_type = Column(Text)           # ROSA, VERDE, VERMELHO, AMARELO, AZUL_ESCURO
    pv_obrigatorio = Column(Boolean, default=False)
    accessory_type = Column(Text)      # PV, TIL, TL, CP
    properties = Column(JSONB)

    project = relationship("ProjectTable", back_populates="nodes")

    __table_args__ = (
        Index("idx_nodes_project", "project_id"),
        Index("idx_nodes_geom", "geometry", postgresql_using="gist"),
    )


class PipeSegmentTable(Base):
    __tablename__ = "pipe_segments"

    id = Column(String, primary_key=True)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    edge_id = Column(String, ForeignKey("edges.id"))
    diameter_mm = Column(Integer, nullable=False, default=150)
    manning_n = Column(Double, nullable=False, default=0.013)
    slope = Column(Double)
    cover_depth = Column(Double)
    flow_depth_ratio = Column(Double)
    velocity = Column(Double)
    tractive_stress = Column(Double)
    flow_rate = Column(Double)
    is_pressurized = Column(Boolean, default=False)

    project = relationship("ProjectTable", back_populates="pipe_segments")

    __table_args__ = (
        Index("idx_pipes_project", "project_id"),
    )


class PumpStationTable(Base):
    __tablename__ = "pump_stations"

    id = Column(String, primary_key=True)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    node_id = Column(String, ForeignKey("nodes.id"))
    capacity_ls = Column(Double)
    head_m = Column(Double)
    capex = Column(Double)
    annual_opex = Column(Double)
    npv = Column(Double)

    project = relationship("ProjectTable", back_populates="pump_stations")
