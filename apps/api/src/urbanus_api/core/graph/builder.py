"""
Graph builder: PostGIS ↔ NetworkX conversion.

Loads edges and nodes from PostGIS and constructs a NetworkX graph
with spatial attributes. Also saves processed graphs back to PostGIS.
"""

from __future__ import annotations

import uuid
from typing import Any

import networkx as nx
from geoalchemy2.functions import ST_X, ST_Y, ST_AsText
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from urbanus_api.data.tables import EdgeTable, NodeTable


async def build_graph_from_postgis(
    project_id: str,
    session: AsyncSession,
) -> nx.Graph:
    """Load edges and nodes from PostGIS and build a NetworkX graph.

    Args:
        project_id: Project ID.
        session: Async database session.

    Returns:
        NetworkX undirected graph with:
        - Node attrs: x (lng), y (lat), z (elevation), node_type, pv_obrigatorio
        - Edge attrs: length_m, name, highway, slope, cost
    """
    G = nx.Graph()

    # Load nodes
    result = await session.execute(
        select(
            NodeTable.id,
            ST_X(NodeTable.geometry).label("lng"),
            ST_Y(NodeTable.geometry).label("lat"),
            NodeTable.elevation,
            NodeTable.node_type,
            NodeTable.pv_obrigatorio,
            NodeTable.is_intersection,
            NodeTable.is_endpoint,
            NodeTable.degree,
        ).where(NodeTable.project_id == project_id)
    )
    for row in result:
        G.add_node(
            row.id,
            x=row.lng,
            y=row.lat,
            z=row.elevation,
            node_type=row.node_type,
            pv_obrigatorio=row.pv_obrigatorio or False,
            is_intersection=row.is_intersection or False,
            is_endpoint=row.is_endpoint or False,
            degree=row.degree or 0,
        )

    # Load edges
    result = await session.execute(
        select(EdgeTable).where(EdgeTable.project_id == project_id)
    )
    for edge in result.scalars():
        # Parse LINESTRING to get source/target from geometry
        # Edges reference nodes via properties JSONB or we infer from geometry
        props = edge.properties or {}
        source = props.get("source_node_id")
        target = props.get("target_node_id")

        if source and target and source in G and target in G:
            G.add_edge(
                source,
                target,
                edge_id=edge.id,
                length_m=edge.length_m or 0,
                name=edge.name,
                highway=edge.highway,
                slope=edge.slope,
                cost=edge.cost,
            )

    return G


async def save_graph_to_postgis(
    project_id: str,
    G: nx.Graph,
    session: AsyncSession,
) -> None:
    """Save processed graph nodes and edges back to PostGIS.

    Args:
        project_id: Project ID.
        G: NetworkX graph with node/edge attributes.
        session: Async database session.
    """
    from geoalchemy2.functions import ST_SetSRID, ST_MakePoint
    from geoalchemy2.shape import from_shape
    from shapely.geometry import Point, LineString

    # Clear existing processed data
    await session.execute(
        NodeTable.__table__.delete().where(NodeTable.project_id == project_id)
    )
    await session.execute(
        EdgeTable.__table__.delete().where(EdgeTable.project_id == project_id)
    )

    # Save nodes
    for node_id, data in G.nodes(data=True):
        lng = data.get("x", 0)
        lat = data.get("y", 0)
        point = from_shape(Point(lng, lat), srid=4326)

        node_row = NodeTable(
            id=str(node_id),
            project_id=project_id,
            geometry=point,
            elevation=data.get("z"),
            degree=data.get("degree", G.degree(node_id)),
            is_intersection=data.get("is_intersection", False),
            is_endpoint=data.get("is_endpoint", False),
            node_type=data.get("node_type"),
            pv_obrigatorio=data.get("pv_obrigatorio", False),
            accessory_type=data.get("accessory_type"),
        )
        session.add(node_row)

    # Save edges
    for u, v, data in G.edges(data=True):
        u_data = G.nodes[u]
        v_data = G.nodes[v]
        line = from_shape(
            LineString([(u_data["x"], u_data["y"]), (v_data["x"], v_data["y"])]),
            srid=4326,
        )

        edge_row = EdgeTable(
            id=data.get("edge_id", f"e_{uuid.uuid4().hex[:8]}"),
            project_id=project_id,
            geometry=line,
            name=data.get("name"),
            highway=data.get("highway"),
            length_m=data.get("length_m"),
            slope=data.get("slope"),
            cost=data.get("cost"),
            properties={
                "source_node_id": str(u),
                "target_node_id": str(v),
            },
        )
        session.add(edge_row)

    await session.commit()
