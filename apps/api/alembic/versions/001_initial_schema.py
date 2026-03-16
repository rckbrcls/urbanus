"""Initial PostGIS schema for URBANUS.

Revision ID: 001
Revises:
Create Date: 2026-03-16
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import geoalchemy2

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    op.create_table(
        "projects",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("created_at", sa.BigInteger(), nullable=False),
        sa.Column("bounds", geoalchemy2.Geometry("POLYGON", srid=4326)),
        sa.Column("area_km2", sa.Double(), nullable=False),
        sa.Column("center", geoalchemy2.Geometry("POINT", srid=4326)),
        sa.Column("zoom", sa.Double(), nullable=False),
        sa.Column("street_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("streets_geojson", sa.dialects.postgresql.JSONB()),
    )
    op.create_index("idx_projects_bounds", "projects", ["bounds"], postgresql_using="gist")

    op.create_table(
        "edges",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("project_id", sa.String(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("geometry", geoalchemy2.Geometry("LINESTRING", srid=4326), nullable=False),
        sa.Column("name", sa.Text()),
        sa.Column("highway", sa.Text()),
        sa.Column("length_m", sa.Double()),
        sa.Column("slope", sa.Double()),
        sa.Column("cost", sa.Double()),
        sa.Column("properties", sa.dialects.postgresql.JSONB()),
    )
    op.create_index("idx_edges_project", "edges", ["project_id"])
    op.create_index("idx_edges_geom", "edges", ["geometry"], postgresql_using="gist")

    op.create_table(
        "nodes",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("project_id", sa.String(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("geometry", geoalchemy2.Geometry("POINT", srid=4326), nullable=False),
        sa.Column("elevation", sa.Double()),
        sa.Column("degree", sa.Integer()),
        sa.Column("is_intersection", sa.Boolean(), server_default="false"),
        sa.Column("is_endpoint", sa.Boolean(), server_default="false"),
        sa.Column("node_type", sa.Text()),
        sa.Column("pv_obrigatorio", sa.Boolean(), server_default="false"),
        sa.Column("accessory_type", sa.Text()),
        sa.Column("properties", sa.dialects.postgresql.JSONB()),
    )
    op.create_index("idx_nodes_project", "nodes", ["project_id"])
    op.create_index("idx_nodes_geom", "nodes", ["geometry"], postgresql_using="gist")

    op.create_table(
        "pipe_segments",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("project_id", sa.String(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("edge_id", sa.String(), sa.ForeignKey("edges.id")),
        sa.Column("diameter_mm", sa.Integer(), nullable=False, server_default="150"),
        sa.Column("manning_n", sa.Double(), nullable=False, server_default="0.013"),
        sa.Column("slope", sa.Double()),
        sa.Column("cover_depth", sa.Double()),
        sa.Column("flow_depth_ratio", sa.Double()),
        sa.Column("velocity", sa.Double()),
        sa.Column("tractive_stress", sa.Double()),
        sa.Column("flow_rate", sa.Double()),
        sa.Column("is_pressurized", sa.Boolean(), server_default="false"),
    )
    op.create_index("idx_pipes_project", "pipe_segments", ["project_id"])

    op.create_table(
        "pump_stations",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("project_id", sa.String(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("node_id", sa.String(), sa.ForeignKey("nodes.id")),
        sa.Column("capacity_ls", sa.Double()),
        sa.Column("head_m", sa.Double()),
        sa.Column("capex", sa.Double()),
        sa.Column("annual_opex", sa.Double()),
        sa.Column("npv", sa.Double()),
    )


def downgrade() -> None:
    op.drop_table("pump_stations")
    op.drop_table("pipe_segments")
    op.drop_table("nodes")
    op.drop_table("edges")
    op.drop_table("projects")
