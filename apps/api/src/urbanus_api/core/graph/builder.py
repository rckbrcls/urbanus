"""
Graph builder: PostGIS ↔ NetworkX conversion.

Loads edges and nodes from PostGIS and constructs a NetworkX graph
with spatial attributes. Also saves processed graphs back to PostGIS.
"""

from __future__ import annotations

from typing import Any

import networkx as nx
from geoalchemy2.functions import ST_X, ST_Y, ST_AsText
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from urbanus_api.data.tables import EdgeTable, NodeTable, PipeSegmentTable, PumpStationTable


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
        .order_by(NodeTable.id)
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
        .order_by(EdgeTable.id)
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
                street_id=street_id,
            )

    # Ensure every street has at least one edge — streets without anchors
    # (e.g. clipped segments with no intersections) would otherwise be missing
    # entirely, leaving houses without sewer coverage.
    _ensure_street_coverage(G, geojson, pos_to_id, haversine)

    # Connect disconnected components — OSM streets may not share exact vertices
    # at intersections, leaving the graph fragmented into isolated clusters.
    _connect_components(G, haversine)

    return G


def _ensure_street_coverage(
    G: nx.Graph,
    geojson: dict,
    pos_to_id: dict[str, str],
    haversine_fn,
) -> None:
    """Guarantee every GeoJSON feature has at least one edge in G.

    For each LineString/MultiLineString feature, checks whether an edge
    already connects its first and last vertices. If not, creates one.

    Handles three previously-missing cases:
    - Features without ``properties.id`` (no longer rely on street_id matching)
    - Circular / very short streets where first==last (uses midpoint vertex)
    - MultiLineString geometries (processes each line segment)
    """
    import uuid

    features = geojson.get("features") or []
    for f in features:
        geom = f.get("geometry", {})
        geom_type = geom.get("type")

        # Collect coordinate arrays (one per line segment)
        if geom_type == "LineString":
            coord_lines = [geom.get("coordinates", [])]
        elif geom_type == "MultiLineString":
            coord_lines = geom.get("coordinates", [])
        else:
            continue

        props = f.get("properties", {})
        elevations = props.get("vertex_elevations", [])
        street_id = str(props.get("id", ""))

        for coords in coord_lines:
            if len(coords) < 2:
                continue

            _add_edge_for_line(
                G, coords, elevations, props, street_id,
                pos_to_id, haversine_fn,
            )


def _add_edge_for_line(
    G: nx.Graph,
    coords: list,
    elevations: list,
    props: dict,
    street_id: str,
    pos_to_id: dict[str, str],
    haversine_fn,
) -> None:
    """Add an edge for a single coordinate line if none exists yet."""
    import uuid

    first = coords[0]
    last = coords[-1]

    first_lat, first_lng = float(first[1]), float(first[0])
    last_lat, last_lng = float(last[1]), float(last[0])

    first_key = f"{first_lat:.5f},{first_lng:.5f}"
    last_key = f"{last_lat:.5f},{last_lng:.5f}"

    first_id = _get_or_create_node(
        G, pos_to_id, first_key, first_lng, first_lat,
        elevations[0] if elevations else None,
    )
    last_id = _get_or_create_node(
        G, pos_to_id, last_key, last_lng, last_lat,
        elevations[-1] if elevations else None,
    )

    # Same node after clustering — use midpoint vertex to keep coverage
    if first_id == last_id:
        if len(coords) < 3:
            return  # 2-vertex line that collapsed to a single node — too short
        mid_idx = len(coords) // 2
        mid = coords[mid_idx]
        mid_lat, mid_lng = float(mid[1]), float(mid[0])
        mid_key = f"{mid_lat:.5f},{mid_lng:.5f}"
        mid_id = _get_or_create_node(
            G, pos_to_id, mid_key, mid_lng, mid_lat,
            elevations[mid_idx] if mid_idx < len(elevations) else None,
            node_type="VERDE",
            is_endpoint=False,
        )
        if mid_id == first_id:
            return  # midpoint also collapsed — street too short
        if not G.has_edge(first_id, mid_id):
            G.add_edge(
                first_id, mid_id,
                length_m=haversine_fn(first_lat, first_lng, mid_lat, mid_lng),
                name=props.get("name"),
                highway=props.get("highway"),
                street_id=street_id,
            )
        return

    # Skip if already reachable through intermediate nodes (e.g. a street
    # A→X→B already has edges A-X and X-B — adding A-B is redundant and
    # creates junctions that inflate the final node count).
    if first_id in G and last_id in G:
        try:
            if nx.has_path(G, first_id, last_id):
                return
        except nx.NetworkXError:
            pass

    length = haversine_fn(first_lat, first_lng, last_lat, last_lng)
    G.add_edge(
        first_id, last_id,
        length_m=length,
        name=props.get("name"),
        highway=props.get("highway"),
        street_id=street_id,
    )


def _get_or_create_node(
    G: nx.Graph,
    pos_to_id: dict[str, str],
    pos_key: str,
    lng: float,
    lat: float,
    elevation: float | None,
    node_type: str = "ROSA",
    is_endpoint: bool = True,
) -> str:
    """Return the node ID at ``pos_key``, creating the node if needed."""
    import uuid

    node_id = pos_to_id.get(pos_key)
    if node_id:
        return node_id

    node_id = str(uuid.uuid4())
    pos_to_id[pos_key] = node_id
    G.add_node(
        node_id,
        x=lng, y=lat, z=elevation,
        node_type=node_type,
        pv_obrigatorio=is_endpoint,
        is_endpoint=is_endpoint,
        is_intersection=False,
        degree=1,
    )
    return node_id


def _connect_components(G: nx.Graph, haversine_fn) -> None:
    """Connect disconnected graph components by adding edges between nearest nodes.

    OSM streets often don't share exact vertex positions at intersections.
    After clustering (5m), some components remain disconnected. This finds the
    closest pair of nodes between each small component and the largest component,
    and adds a connecting edge.
    """
    components = list(nx.connected_components(G))
    if len(components) <= 1:
        return

    # Sort by size descending — largest component is the "main" network
    components.sort(key=len, reverse=True)
    main_component = components[0]

    for comp in components[1:]:
        best_dist = float("inf")
        best_pair = None

        # Find closest node pair between this component and the main
        for node_a in comp:
            a_data = G.nodes[node_a]
            lat_a, lng_a = a_data.get("y", 0), a_data.get("x", 0)

            for node_b in main_component:
                b_data = G.nodes[node_b]
                lat_b, lng_b = b_data.get("y", 0), b_data.get("x", 0)

                dist = haversine_fn(lat_a, lng_a, lat_b, lng_b)
                if dist < best_dist:
                    best_dist = dist
                    best_pair = (node_a, node_b)

        if best_pair:
            u, v = best_pair
            G.add_edge(u, v, length_m=best_dist, name=None, highway=None)
            # Absorb this component into main for next iterations
            main_component = main_component | comp


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
            id=f"e_{u}_{v}",
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


async def save_sewer_network_to_postgis(
    project_id: str,
    network: dict[str, Any],
    session: AsyncSession,
) -> None:
    """Persist a complete SewerNetwork payload to PostGIS tables."""
    from geoalchemy2.shape import from_shape
    from shapely.geometry import LineString, Point

    await session.execute(
        PumpStationTable.__table__.delete().where(PumpStationTable.project_id == project_id)
    )
    await session.execute(
        PipeSegmentTable.__table__.delete().where(PipeSegmentTable.project_id == project_id)
    )
    await session.execute(
        EdgeTable.__table__.delete().where(EdgeTable.project_id == project_id)
    )
    await session.execute(
        NodeTable.__table__.delete().where(NodeTable.project_id == project_id)
    )

    nodes = network.get("nodes") or []
    edges = network.get("edges") or []
    pipes = network.get("pipes") or []
    pump_stations = network.get("pump_stations") or []

    node_lookup: dict[str, dict[str, Any]] = {}
    for node in nodes:
        node_id = str(node["id"])
        node_lookup[node_id] = node
        point = from_shape(Point(node.get("lng", 0), node.get("lat", 0)), srid=4326)
        session.add(NodeTable(
            id=node_id,
            project_id=project_id,
            geometry=point,
            elevation=node.get("elevation"),
            degree=node.get("degree", 0),
            is_intersection=node.get("is_intersection", False),
            is_endpoint=node.get("is_endpoint", False),
            node_type=node.get("node_type"),
            pv_obrigatorio=node.get("pv_obrigatorio", False),
            accessory_type=node.get("accessory_type"),
            properties={
                "is_collection_point": node.get("is_collection_point", False),
            },
        ))

    for edge in edges:
        source_id = str(edge["source_node_id"])
        target_id = str(edge["target_node_id"])
        source = node_lookup.get(source_id)
        target = node_lookup.get(target_id)
        if source is None or target is None:
            continue

        coordinates = [
            (source.get("lng", 0), source.get("lat", 0)),
            *[
                (point[0], point[1])
                for point in (edge.get("waypoints") or [])
                if isinstance(point, list) and len(point) >= 2
            ],
            (target.get("lng", 0), target.get("lat", 0)),
        ]
        line = from_shape(LineString(coordinates), srid=4326)

        session.add(EdgeTable(
            id=str(edge["id"]),
            project_id=project_id,
            geometry=line,
            name=edge.get("name"),
            highway=edge.get("highway"),
            length_m=edge.get("length_m"),
            slope=edge.get("slope"),
            cost=edge.get("cost"),
            properties={
                "source_node_id": source_id,
                "target_node_id": target_id,
                "waypoints": edge.get("waypoints"),
            },
        ))

    for pipe in pipes:
        session.add(PipeSegmentTable(
            id=f"{project_id}:{pipe['edge_id']}",
            project_id=project_id,
            edge_id=pipe["edge_id"],
            diameter_mm=pipe.get("diameter_mm", 150),
            manning_n=pipe.get("manning_n", 0.013),
            slope=pipe.get("slope"),
            cover_depth=pipe.get("cover_depth"),
            flow_depth_ratio=pipe.get("flow_depth_ratio"),
            velocity=pipe.get("velocity"),
            tractive_stress=pipe.get("tractive_stress"),
            flow_rate=pipe.get("flow_rate"),
            is_pressurized=pipe.get("is_pressurized", False),
        ))

    for pump in pump_stations:
        session.add(PumpStationTable(
            id=str(pump["id"]),
            project_id=project_id,
            node_id=pump.get("node_id"),
            capacity_ls=pump.get("capacity_ls"),
            head_m=pump.get("head_m"),
            capex=pump.get("capex"),
            annual_opex=pump.get("annual_opex"),
            npv=pump.get("npv"),
        ))

    await session.commit()
