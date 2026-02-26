"""
Node extraction service.

Extrai nós (interseções ou todos os vértices) de um GeoJSON de ruas
enriquecido com elevação.

Modos:
  - "intersections": apenas nós com grau >= 2 (cruzamentos reais)
  - "all": todos os vértices de cada rua (para edição completa)
"""

from __future__ import annotations

import uuid
from typing import Any, Literal


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

    # ── Passo 1: Mapear posições → street_ids (para calcular degree) ──
    position_map: dict[str, dict[str, Any]] = {}
    total_vertices = 0

    for feature in features:
        geometry = feature.get("geometry", {})
        if geometry.get("type") != "LineString":
            continue

        props = feature.get("properties", {})
        street_id = str(props.get("id", str(uuid.uuid4())))
        street_name = props.get("name") or "Unnamed"
        coordinates = geometry.get("coordinates", [])

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

    # ── Passo 2: Construir nós ──
    nodes = []

    for feature in features:
        geometry = feature.get("geometry", {})
        if geometry.get("type") != "LineString":
            continue

        props = feature.get("properties", {})
        street_id = str(props.get("id", str(uuid.uuid4())))
        street_name = props.get("name") or "Unnamed"
        highway = props.get("highway") or None
        coordinates = geometry.get("coordinates", [])
        elevations = props.get("vertex_elevations", [])

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
            if mode == "intersections" and not is_intersection:
                continue

            elevation = None
            if i < len(elevations) and elevations[i] is not None:
                elevation = elevations[i]

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
            }
            nodes.append(node)

    # ── Passo 3: Marcar nós de maior e menor elevação ──
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
        if node["id"] == lowest_id:
            node["isLowestElevation"] = True

    # ── Metadata ──
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
