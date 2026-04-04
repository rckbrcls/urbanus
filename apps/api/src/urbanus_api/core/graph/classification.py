"""
Etapa 1 — Classificação de nós obrigatórios.

Extrai nós de um GeoJSON de ruas enriquecido com elevação e classifica:
- ROSA: PV obrigatório (interseção, confluência, mudança de direção, queda)
- AMARELO: Ponto alto (todos vizinhos mais baixos)
- AZUL_ESCURO: Ponto baixo (todos vizinhos mais altos)

Modos:
  - "intersections": apenas nós com grau >= 2 (cruzamentos reais)
  - "all": todos os vértices de cada rua (para edição completa)
"""

from __future__ import annotations

import uuid
from typing import Any, Literal

from urbanus_geo.calculations import haversine
from urbanus_geo.constants import DIRECTION_CHANGE_THRESHOLD, SNAP_DISTANCE_METERS


def _cluster_nearby_nodes(
    nodes: list[dict[str, Any]],
    snap_distance: float = 5.0,
) -> list[dict[str, Any]]:
    """Merge nodes within snap_distance meters using Union-Find.

    The representative of each cluster is the node with highest degree.
    Properties are merged: street_ids union, degree recalculated,
    elevation averaged, pv_obrigatorio = any True in cluster.
    """
    n = len(nodes)
    if n == 0:
        return nodes

    # Union-Find
    parent = list(range(n))
    rank = [0] * n

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a: int, b: int) -> None:
        ra, rb = find(a), find(b)
        if ra == rb:
            return
        if rank[ra] < rank[rb]:
            ra, rb = rb, ra
        parent[rb] = ra
        if rank[ra] == rank[rb]:
            rank[ra] += 1

    # Build pairs within snap_distance
    for i in range(n):
        pi = nodes[i]["position"]
        for j in range(i + 1, n):
            pj = nodes[j]["position"]
            dist = haversine(pi["lat"], pi["lng"], pj["lat"], pj["lng"])
            if dist <= snap_distance:
                union(i, j)

    # Group by cluster
    clusters: dict[int, list[int]] = {}
    for i in range(n):
        root = find(i)
        clusters.setdefault(root, []).append(i)

    # Build merged nodes
    merged: list[dict[str, Any]] = []
    for indices in clusters.values():
        if len(indices) == 1:
            merged.append(nodes[indices[0]])
            continue

        # Pick representative: highest original degree
        rep_idx = max(indices, key=lambda i: (nodes[i].get("degree", 0), nodes[i].get("id", "")))
        rep = dict(nodes[rep_idx])

        # Merge street_ids and street_names
        all_street_ids: set[str] = set()
        all_street_names: set[str] = set()
        elevations: list[float] = []
        any_pv = False
        any_endpoint = False

        for i in indices:
            nd = nodes[i]
            all_street_ids.update(nd.get("connectedStreets", []))
            # Include primary streetId — may not be in connectedStreets
            sid = nd.get("streetId")
            if sid:
                all_street_ids.add(sid)
            all_street_names.update(nd.get("streetNames", []))
            sname = nd.get("streetName")
            if sname and sname != "Unnamed":
                all_street_names.add(sname)
            if nd.get("elevation") is not None:
                elevations.append(nd["elevation"])
            if nd.get("pvObrigatorio"):
                any_pv = True
            if nd.get("isEndpoint"):
                any_endpoint = True

        rep["connectedStreets"] = sorted(all_street_ids)
        rep["streetNames"] = sorted(all_street_names - {"Unnamed"})
        rep["degree"] = len(all_street_ids)
        rep["isIntersection"] = rep["degree"] >= 2
        rep["isEndpoint"] = any_endpoint
        if elevations:
            rep["elevation"] = sum(elevations) / len(elevations)
        if any_pv:
            rep["pvObrigatorio"] = True
            rep["nodeType"] = "ROSA"
            rep["accessoryType"] = "PV"
        # Intersections are structural (for graph connectivity) but NOT
        # mandatory PVs — the pipeline will decide which actually need PVs
        # based on tree topology (junctions, direction changes, etc.).
        # Only mark as intersection for graph construction purposes.

        merged.append(rep)

    return merged


def enforce_direction_changes(G) -> None:
    """Mark degree-2 nodes with direction change > threshold as ROSA/pv_obrigatorio.

    For each degree-2 node in the graph, compute the angle between the two
    adjacent edges. If the deflection (180 - angle) exceeds
    DIRECTION_CHANGE_THRESHOLD, the node needs a PV for the pipe bend.
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

        nd = G.nodes[node]
        n1d = G.nodes[n1]
        n2d = G.nodes[n2]

        a = (n1d.get("y", 0), n1d.get("x", 0))
        b = (nd.get("y", 0), nd.get("x", 0))
        c = (n2d.get("y", 0), n2d.get("x", 0))

        angle = angle_at_node(a, b, c)
        deflection = 180.0 - angle

        if deflection > DIRECTION_CHANGE_THRESHOLD:
            ndata["node_type"] = "ROSA"
            ndata["pv_obrigatorio"] = True


def extract_nodes(
    geojson: dict[str, Any],
    mode: Literal["intersections", "all"] = "intersections",
) -> dict[str, Any]:
    """
    Extrai nós de um GeoJSON de ruas.

    Args:
        geojson: FeatureCollection com LineStrings enriquecidas (vertex_elevations)
        mode: "intersections" retorna apenas grau >= 2;
              "all" retorna todos os vértices (um por vértice por rua)

    Returns:
        Dict com "nodes" (lista) e "metadata" (estatísticas)
    """
    features = geojson.get("features", [])

    # Pre-compute a stable ID per feature so both passes use the same value
    # (avoids generating different UUIDs on each iteration for features without id).
    feature_ids: list[str] = []
    for feature in features:
        props = feature.get("properties", {})
        feature_ids.append(str(props.get("id", str(uuid.uuid4()))))

    # Passo 1: Mapear posições -> street_ids (para calcular degree)
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
                pos_key = f"{lat:.6f},{lng:.6f}"

                if pos_key not in position_map:
                    position_map[pos_key] = {"street_ids": set(), "street_names": set()}

                position_map[pos_key]["street_ids"].add(street_id)
                position_map[pos_key]["street_names"].add(street_name)

    # Passo 2: Construir nós
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

                # Filtrar por modo
                if mode == "intersections" and not (is_intersection or is_endpoint):
                    continue

                elevation = None
                if i < len(elevations) and elevations[i] is not None:
                    elevation = elevations[i]

                # Classificação de nó (Etapa 1)
                node_type = None
                pv_obrigatorio = False

                if is_endpoint:
                    node_type = "ROSA"
                    pv_obrigatorio = True

                # Detecção de queda abrupta (> 0.50m entre vértices adjacentes)
                if elevation is not None and not pv_obrigatorio:
                    for di in [-1, 1]:
                        ni = i + di
                        if 0 <= ni < len(elevations) and elevations[ni] is not None:
                            if abs(elevation - elevations[ni]) > 0.50:
                                node_type = "ROSA"
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

    # Passo 3.5: Clustering espacial — merge nós dentro de SNAP_DISTANCE_METERS
    nodes = _cluster_nearby_nodes(nodes, snap_distance=SNAP_DISTANCE_METERS)

    # Passo 4: Marcar nós de maior e menor elevação
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
                node["nodeType"] = "AMARELO"
        if node["id"] == lowest_id:
            node["isLowestElevation"] = True
            if node["nodeType"] is None:
                node["nodeType"] = "AZUL_ESCURO"

    # Metadata (totalUniquePositions reflects pre-clustering count)
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
