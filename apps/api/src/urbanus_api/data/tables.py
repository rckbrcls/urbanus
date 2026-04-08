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


class EdgeTable(Base):
    __tablename__ = "edges"

    id = Column(String, primary_key=True)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    geometry = Column(Geometry("LINESTRING", srid=4326), nullable=False)
    name = Column(Text)
    highway = Column(Text)
    length_m = Column(Double)
    slope = Column(Double)
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
    node_type = Column(Text)           # MANDATORY, INTERMEDIATE, REDUNDANT, HIGH_POINT, LOW_POINT
    pv_obrigatorio = Column(Boolean, default=False)
    accessory_type = Column(Text)      # PV (legacy rows may still contain old values)
    properties = Column(JSONB)

    project = relationship("ProjectTable", back_populates="nodes")

    __table_args__ = (
        Index("idx_nodes_project", "project_id"),
        Index("idx_nodes_geom", "geometry", postgresql_using="gist"),
    )
