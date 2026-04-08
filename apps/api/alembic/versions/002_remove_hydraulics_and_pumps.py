"""Remove hydraulics, pricing, and pump persistence tables.

Revision ID: 002
Revises: 001
Create Date: 2026-04-08
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("DROP TABLE IF EXISTS pump_stations")
    op.execute("DROP TABLE IF EXISTS pipe_segments")
    op.execute("ALTER TABLE edges DROP COLUMN IF EXISTS cost")


def downgrade() -> None:
    op.add_column("edges", sa.Column("cost", sa.Double(), nullable=True))

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
