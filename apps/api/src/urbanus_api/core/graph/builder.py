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


def build_graph_from_geojson(geojson: dict) -> nx.Graph:
    """Build a NetworkX graph directly from streets GeoJSON.

    Used as fallback when no graph data exists in PostGIS yet.
    Extracts nodes via classification, keeps only anchors (intersections +
    endpoints), and connects consecutive anchors along each street.

    Args:
        geojson: Enriched GeoJSON (with elevations) from streets_geojson.

    Returns:
        NetworkX undirected graph with same attribute format as
        build_graph_from_postgis.
    """
    from urbanus_api.core.graph.classification import extract_nodes
    from urbanus_geo.calculations import haversine

    result = extract_nodes(geojson, mode="all")
    nodes = result["nodes"]

    G = nx.Graph()

    # Position-based dedup (nodes are already clustered at 5m)
    pos_to_id: dict[str, str] = {}

    for n in nodes:
        is_anchor = n.get("isIntersection") or n.get("isEndpoint")
        if not is_anchor:
            continue

        pos = n["position"]
        pos_key = f'{pos["lat"]:.5f},{pos["lng"]:.5f}'

        if pos_key in pos_to_id:
            continue

        pos_to_id[pos_key] = n["id"]
        G.add_node(
            n["id"],
            x=pos["lng"],
            y=pos["lat"],
            z=n.get("elevation"),
            node_type=n.get("nodeType"),
            pv_obrigatorio=n.get("pvObrigatorio", False),
            is_intersection=n.get("isIntersection", False),
            is_endpoint=n.get("isEndpoint", False),
            degree=n.get("degree", 0),
        )

    # Group nodes by street and connect consecutive anchors as edges
    streets: dict[str, list[dict]] = {}
    for n in nodes:
        sid = n.get("streetId", "")
        streets.setdefault(sid, []).append(n)

    for street_id, street_nodes in streets.items():
        sorted_nodes = sorted(street_nodes, key=lambda n: n.get("vertexIndex", 0))
        anchors = [
            n for n in sorted_nodes
            if n.get("isIntersection") or n.get("isEndpoint")
        ]

        for i in range(len(anchors) - 1):
            src, tgt = anchors[i], anchors[i + 1]
            src_pos = src["position"]
            tgt_pos = tgt["position"]
            src_key = f'{src_pos["lat"]:.5f},{src_pos["lng"]:.5f}'
            tgt_key = f'{tgt_pos["lat"]:.5f},{tgt_pos["lng"]:.5f}'
            src_id = pos_to_id.get(src_key)
            tgt_id = pos_to_id.get(tgt_key)

            if not src_id or not tgt_id or src_id == tgt_id:
                continue
            if src_id not in G or tgt_id not in G:
                continue

            length = haversine(
                src_pos["lat"], src_pos["lng"],
                tgt_pos["lat"], tgt_pos["lng"],
            )
            G.add_edge(
                src_id, tgt_id,
                length_m=length,
                name=src.get("streetName"),
                highway=src.get("highway"),
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
            id=f"e_{uuid.uuid4().hex}",
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
