"""
Step 1 - Structural node extraction and classification.

Extracts nodes from an elevation-enriched street GeoJSON and labels:
- MANDATORY: structurally preserved node
- HIGH_POINT: locally high node
- LOW_POINT: locally low node

Modes:
  - "intersections": only real intersections and endpoints
  - "all": every street vertex, used when the graph editor needs full detail
"""

from __future__ import annotations

import uuid
from typing import Any, Literal

from urbanus_geo.calculations import haversine
from urbanus_geo.constants import DIRECTION_CHANGE_THRESHOLD, SNAP_DISTANCE_METERS
from urbanus_geo.types import NodeType


def _is_meaningful_elevation(value: float | None) -> bool:
    """Return True when an elevation value can be trusted for averaging.

    The DEM enrichment path can produce ``0`` for boundary artifacts. Those
    zeros are tracked separately during clustering so they do not dilute valid
    elevations from coincident nodes.
    """
    return value is not None and value != 0


def _cluster_nearby_nodes(
    nodes: list[dict[str, Any]],
    snap_distance: float = 5.0,
) -> list[dict[str, Any]]:
    """Merge nearby extracted nodes into one logical graph node.

    Nodes closer than ``snap_distance`` meters are grouped with Union-Find.
    Each cluster keeps the highest-degree node as representative because it is
    the best structural anchor for intersections. Street ids/names are merged,
    degree is recalculated from unique streets, valid elevations are averaged,
    and mandatory-PV status is preserved if any member requires it.

    Args:
        nodes: Extracted node dictionaries using frontend-facing camelCase keys.
        snap_distance: Maximum distance, in meters, for grouping nodes.

    Returns:
        A new list where clustered nodes are represented once.
    """
    n = len(nodes)
    if n == 0:
        return nodes

    # Union-Find keeps transitive nearby nodes in the same cluster, e.g. when
    # A is near B and B is near C even if A is just outside C's radius.
    parent = list(range(n))
    rank = [0] * n

    def find(x: int) -> int:
        """Return the canonical cluster index, compressing the path."""
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a: int, b: int) -> None:
        """Join two clusters while keeping the tree shallow via rank."""
        ra, rb = find(a), find(b)
        if ra == rb:
            return
        if rank[ra] < rank[rb]:
            ra, rb = rb, ra
        parent[rb] = ra
        if rank[ra] == rank[rb]:
            rank[ra] += 1

    # Compare every pair because extracted node counts are small enough here,
    # and the exact haversine distance avoids projection assumptions.
    for i in range(n):
        pi = nodes[i]["position"]
        for j in range(i + 1, n):
            pj = nodes[j]["position"]
            dist = haversine(pi["lat"], pi["lng"], pj["lat"], pj["lng"])
            if dist <= snap_distance:
                union(i, j)

    # Materialize cluster membership after all pair unions are known.
    clusters: dict[int, list[int]] = {}
    for i in range(n):
        root = find(i)
        clusters.setdefault(root, []).append(i)

    # Build one representative node per spatial cluster.
    merged: list[dict[str, Any]] = []
    for indices in clusters.values():
        if len(indices) == 1:
            merged.append(nodes[indices[0]])
            continue

        # Prefer the node that already looked most connected before merging.
        rep_idx = max(indices, key=lambda i: (nodes[i].get("degree", 0), nodes[i].get("id", "")))
        rep = dict(nodes[rep_idx])

        # Aggregate every structural and display attribute contributed by the
        # clustered vertices before rewriting the representative.
        all_street_ids: set[str] = set()
        all_street_names: set[str] = set()
        meaningful_elevations: list[float] = []
        has_zero_elevation = False
        any_pv = False
        any_endpoint = False

        for i in indices:
            nd = nodes[i]
            all_street_ids.update(nd.get("connectedStreets", []))
            # Include primary streetId; it may not be in connectedStreets.
            sid = nd.get("streetId")
            if sid:
                all_street_ids.add(sid)
            all_street_names.update(nd.get("streetNames", []))
            sname = nd.get("streetName")
            if sname and sname != "Unnamed":
                all_street_names.add(sname)
            elevation = nd.get("elevation")
            if _is_meaningful_elevation(elevation):
                meaningful_elevations.append(elevation)
            elif elevation == 0:
                has_zero_elevation = True
            if nd.get("pvObrigatorio"):
                any_pv = True
            if nd.get("isEndpoint"):
                any_endpoint = True

        rep["connectedStreets"] = sorted(all_street_ids)
        rep["streetNames"] = sorted(all_street_names - {"Unnamed"})
        rep["degree"] = len(all_street_ids)
        rep["isIntersection"] = rep["degree"] >= 2
        rep["isEndpoint"] = any_endpoint
        if meaningful_elevations:
            rep["elevation"] = sum(meaningful_elevations) / len(meaningful_elevations)
        elif has_zero_elevation:
            rep["elevation"] = 0.0
        else:
            rep["elevation"] = None
        if any_pv:
            rep["pvObrigatorio"] = True
            rep["nodeType"] = NodeType.MANDATORY.value
            rep["accessoryType"] = "PV"
        # Intersections are structural (for graph connectivity) but NOT
        # mandatory PVs; the pipeline will decide which actually need PVs
        # based on tree topology (junctions, direction changes, etc.).
        # Only mark as intersection for graph construction purposes.

        merged.append(rep)

    return merged


def enforce_direction_changes(G) -> None:
    """Mark sharp degree-2 pipe bends as mandatory PV nodes.

    The function mutates ``G`` in-place. Only simple pass-through nodes are
    considered: existing mandatory PVs, endpoints, and intersections are left
    untouched. A node becomes mandatory when the deflection angle between its
    two adjacent edges exceeds ``DIRECTION_CHANGE_THRESHOLD``.

    Args:
        G: Graph whose nodes store longitude in ``x`` and latitude in ``y``.

    Returns:
        None. Matching nodes receive ``node_type`` and ``pv_obrigatorio``.
    """
    from urbanus_geo.calculations import angle_at_node

    for node in list(G.nodes):
        if G.degree(node) != 2:
            continue
        ndata = G.nodes[node]
        if ndata.get("pv_obrigatorio"):
            continue

        neighbors = list(G.neighbors(node))
        if len(neighbors) != 2:
            continue
        n1, n2 = neighbors

        # angle_at_node expects coordinate tuples ordered as (lat, lng).
        nd = G.nodes[node]
        n1d = G.nodes[n1]
        n2d = G.nodes[n2]

        a = (n1d.get("y", 0), n1d.get("x", 0))
        b = (nd.get("y", 0), nd.get("x", 0))
        c = (n2d.get("y", 0), n2d.get("x", 0))

        angle = angle_at_node(a, b, c)
        deflection = 180.0 - angle

        if deflection > DIRECTION_CHANGE_THRESHOLD:
            # A sharp bend needs a physical access point so the optimized pipe
            # network cannot remove it later as a simple through-pipe.
            ndata["node_type"] = NodeType.MANDATORY.value
            ndata["pv_obrigatorio"] = True


def extract_nodes(
    geojson: dict[str, Any],
    mode: Literal["intersections", "all"] = "intersections",
) -> dict[str, Any]:
    """Extract editable sewer graph nodes from street GeoJSON.

    The input is expected to be a FeatureCollection whose LineString or
    MultiLineString features may include ``properties.vertex_elevations`` with
    one elevation per coordinate. The function performs two passes: first it
    counts which streets share each rounded coordinate, then it emits nodes with
    structural metadata and optional elevation classification.

    Args:
        geojson: Street FeatureCollection, optionally enriched with vertex
            elevation arrays.
        mode: ``"intersections"`` keeps intersections and endpoints only;
            ``"all"`` emits every street vertex.

    Returns:
        A dictionary with ``nodes`` and extraction ``metadata`` for the API.
    """
    features = geojson.get("features", [])

    # Pre-compute a stable ID per feature so both passes use the same value
    # (avoids generating different UUIDs on each iteration for features without id).
    feature_ids: list[str] = []
    for feature in features:
        props = feature.get("properties", {})
        feature_ids.append(str(props.get("id", str(uuid.uuid4()))))

    # First pass: map rounded positions to streets so degree is based on
    # distinct connected streets rather than repeated vertices on one feature.
    position_map: dict[str, dict[str, Any]] = {}
    total_vertices = 0

    for feature, street_id in zip(features, feature_ids):
        geometry = feature.get("geometry", {})
        geom_type = geometry.get("type")

        if geom_type == "LineString":
            coord_lines = [geometry.get("coordinates", [])]
        elif geom_type == "MultiLineString":
            coord_lines = geometry.get("coordinates", [])
        else:
            continue

        props = feature.get("properties", {})
        street_name = props.get("name") or "Unnamed"

        for coordinates in coord_lines:
            for coord in coordinates:
                total_vertices += 1
                if len(coord) < 2:
                    continue

                lng, lat = coord[0], coord[1]
                # Six decimals is roughly decimeter precision and matches the
                # existing extraction contract before spatial clustering.
                pos_key = f"{lat:.6f},{lng:.6f}"

                if pos_key not in position_map:
                    position_map[pos_key] = {"street_ids": set(), "street_names": set()}

                position_map[pos_key]["street_ids"].add(street_id)
                position_map[pos_key]["street_names"].add(street_name)

    # Second pass: emit node records with elevation and structural flags.
    nodes = []

    for feature, street_id in zip(features, feature_ids):
        geometry = feature.get("geometry", {})
        geom_type = geometry.get("type")

        if geom_type == "LineString":
            coord_lines = [geometry.get("coordinates", [])]
        elif geom_type == "MultiLineString":
            coord_lines = geometry.get("coordinates", [])
        else:
            continue

        props = feature.get("properties", {})
        street_name = props.get("name") or "Unnamed"
        highway = props.get("highway") or None
        elevations = props.get("vertex_elevations", [])

        for coordinates in coord_lines:
            for i, coord in enumerate(coordinates):
                if len(coord) < 2:
                    continue

                lng, lat = coord[0], coord[1]
                pos_key = f"{lat:.6f},{lng:.6f}"

                entry = position_map.get(pos_key, {"street_ids": set(), "street_names": set()})
                degree = len(entry["street_ids"])
                is_intersection = degree >= 2
                is_endpoint = i == 0 or i == len(coordinates) - 1

                # In compact mode, keep endpoints as well as true intersections
                # so every street segment still has graph anchors.
                if mode == "intersections" and not (is_intersection or is_endpoint):
                    continue

                elevation = None
                if i < len(elevations) and elevations[i] is not None:
                    elevation = elevations[i]

                # Endpoints are preserved because open street ends need a
                # stable graph node for routing and later editing.
                node_type = None
                pv_obrigatorio = False

                if is_endpoint:
                    node_type = NodeType.MANDATORY.value
                    pv_obrigatorio = True

                # Abrupt per-vertex terrain changes are treated as mandatory
                # split points so later simplification cannot smooth them away.
                if elevation is not None and not pv_obrigatorio:
                    for di in [-1, 1]:
                        ni = i + di
                        if 0 <= ni < len(elevations) and elevations[ni] is not None:
                            if abs(elevation - elevations[ni]) > 0.50:
                                node_type = NodeType.MANDATORY.value
                                pv_obrigatorio = True
                                break

                node = {
                    "id": str(uuid.uuid4()),
                    "position": {"lat": lat, "lng": lng},
                    "elevation": elevation,
                    "degree": degree,
                    "isIntersection": is_intersection,
                    "isEndpoint": is_endpoint,
                    "connectedStreets": sorted(entry["street_ids"]),
                    "streetNames": sorted(entry["street_names"] - {"Unnamed"}),
                    "streetId": street_id,
                    "streetName": street_name,
                    "highway": highway,
                    "vertexIndex": i,
                    "isHighestElevation": False,
                    "isLowestElevation": False,
                    "nodeType": node_type,
                    "pvObrigatorio": pv_obrigatorio,
                    "accessoryType": "PV" if pv_obrigatorio else None,
                }
                nodes.append(node)

    # Merge coincident or near-coincident vertices produced by different street
    # features into one logical node before computing global extrema.
    nodes = _cluster_nearby_nodes(nodes, snap_distance=SNAP_DISTANCE_METERS)

    # Mark the highest and lowest intersection nodes for UI context. These
    # labels do not override already-mandatory endpoint or PV decisions.
    highest_id = None
    lowest_id = None
    highest_elev = float("-inf")
    lowest_elev = float("inf")

    for node in nodes:
        elev = node["elevation"]
        if elev is None:
            continue
        if node.get("isIntersection"):
            if elev > highest_elev:
                highest_elev = elev
                highest_id = node["id"]
            if elev < lowest_elev:
                lowest_elev = elev
                lowest_id = node["id"]

    for node in nodes:
        if node["id"] == highest_id:
            node["isHighestElevation"] = True
            if node["nodeType"] is None:
                node["nodeType"] = NodeType.HIGH_POINT.value
        if node["id"] == lowest_id:
            node["isLowestElevation"] = True
            if node["nodeType"] is None:
                node["nodeType"] = NodeType.LOW_POINT.value

    # totalUniquePositions intentionally reflects the pre-clustering coordinate
    # map; filteredNodes reflects the final emitted node list.
    total_unique = len(position_map)

    metadata = {
        "totalVertices": total_vertices,
        "totalUniquePositions": total_unique,
        "filteredNodes": len(nodes),
        "highestElevationNodeId": highest_id,
        "lowestElevationNodeId": lowest_id,
        "highestElevation": highest_elev if highest_id else None,
        "lowestElevation": lowest_elev if lowest_id else None,
    }

    return {"nodes": nodes, "metadata": metadata}
