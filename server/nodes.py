"""
Node extraction service.

Extrai nós (interseções) de um GeoJSON de ruas enriquecido com elevação.
Filtra apenas nós com grau >= 2 (cruzamentos reais) e marca os nós
de maior e menor elevação.
"""

from __future__ import annotations

import uuid
from typing import Any


def extract_nodes(geojson: dict[str, Any]) -> dict[str, Any]:
    """
    Extrai nós de interseção de um GeoJSON de ruas.

    Algoritmo:
    1. Itera todas as features LineString e seus vértices
    2. Cria chave de posição com precisão de 6 casas decimais
    3. Rastreia quais street_ids passam por cada posição (grau = nº de ruas distintas)
    4. Filtra: retorna apenas posições com grau >= 2
    5. Anexa elevação de vertex_elevations
    6. Identifica nó de maior e menor elevação

    Args:
        geojson: FeatureCollection com LineStrings enriquecidas (vertex_elevations)

    Returns:
        Dict com "nodes" (lista) e "metadata" (estatísticas)
    """
    features = geojson.get("features", [])

    # Mapeamento: pos_key -> { street_ids, lat, lng, elevation, street_names }
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
        elevations = props.get("vertex_elevations", [])

        for i, coord in enumerate(coordinates):
            total_vertices += 1

            if len(coord) < 2:
                continue

            lng, lat = coord[0], coord[1]
            pos_key = f"{lat:.6f},{lng:.6f}"

            elevation = None
            if i < len(elevations) and elevations[i] is not None:
                elevation = elevations[i]

            if pos_key not in position_map:
                position_map[pos_key] = {
                    "lat": lat,
                    "lng": lng,
                    "elevation": elevation,
                    "street_ids": set(),
                    "street_names": set(),
                    "is_endpoint": False,
                }

            entry = position_map[pos_key]
            entry["street_ids"].add(street_id)
            entry["street_names"].add(street_name)

            # Atualizar elevação se ainda não tiver
            if entry["elevation"] is None and elevation is not None:
                entry["elevation"] = elevation

            # Marcar se é endpoint (primeiro ou último vértice)
            if i == 0 or i == len(coordinates) - 1:
                entry["is_endpoint"] = True

    total_unique = len(position_map)

    # Filtrar: apenas posições com grau >= 2 (2+ ruas distintas)
    nodes = []
    for pos_key, entry in position_map.items():
        degree = len(entry["street_ids"])
        if degree < 2:
            continue

        node = {
            "id": str(uuid.uuid4()),
            "position": {
                "lat": entry["lat"],
                "lng": entry["lng"],
            },
            "elevation": entry["elevation"],
            "degree": degree,
            "isIntersection": True,
            "isEndpoint": entry["is_endpoint"],
            "connectedStreets": sorted(entry["street_ids"]),
            "streetNames": sorted(entry["street_names"] - {"Unnamed"}),
            "isHighestElevation": False,
            "isLowestElevation": False,
        }
        nodes.append(node)

    # Identificar nós de maior e menor elevação
    highest_id = None
    lowest_id = None
    highest_elev = float("-inf")
    lowest_elev = float("inf")

    for node in nodes:
        elev = node["elevation"]
        if elev is None:
            continue
        if elev > highest_elev:
            highest_elev = elev
            highest_id = node["id"]
        if elev < lowest_elev:
            lowest_elev = elev
            lowest_id = node["id"]

    # Marcar nós de elevação extrema
    for node in nodes:
        if node["id"] == highest_id:
            node["isHighestElevation"] = True
        if node["id"] == lowest_id:
            node["isLowestElevation"] = True

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
