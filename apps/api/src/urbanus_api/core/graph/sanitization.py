"""
Etapas 2-4 — Sanitização do grafo de rede de esgoto.

Etapa 2: Subdivisão de arestas longas (> dist_max) com nós VERDE.
Etapa 3: Remoção de nós redundantes (< dist_min) marcados VERMELHO.
Etapa 4: Resolução de clusters de curva (ângulo < threshold).
"""

from __future__ import annotations

import math
import uuid

import networkx as nx

from urbanus_geo.calculations import haversine, angle_at_node, line_intersection
from urbanus_geo.constants import (
    LONG_EDGE_MAX_DISTANCE,
    REDUNDANT_NODE_MIN_DISTANCE,
    CURVE_ANGLE_THRESHOLD,
    GRADE_BREAK_THRESHOLD,
    MAX_TERRAIN_SLOPE,
    MIN_PV_SPACING,
    SNAP_DISTANCE_METERS,
)


def sanitize_long_edges(
    G: nx.Graph,
    dist_max: float = LONG_EDGE_MAX_DISTANCE,
) -> nx.Graph:
    """Etapa 2 — Subdivisão de arestas longas.

    Arestas com comprimento > dist_max são subdivididas inserindo nós VERDE
    intermediários com elevação interpolada linearmente.

    Args:
        G: Grafo NetworkX com atributos de nó (x=lng, y=lat, z=elevation).
        dist_max: Distância máxima permitida (metros).

    Returns:
        Grafo modificado (in-place).
    """
    edges_to_process = []
    for u, v, data in G.edges(data=True):
        length = data.get("length_m", 0)
        if length > dist_max:
            edges_to_process.append((u, v, data, length))

    for u, v, data, length in edges_to_process:
        n_segments = int(length / dist_max) + 1
        u_data = G.nodes[u]
        v_data = G.nodes[v]

        lat_u, lng_u = u_data["y"], u_data["x"]
        lat_v, lng_v = v_data["y"], v_data["x"]
        z_u = u_data.get("z")
        z_v = v_data.get("z")

        G.remove_edge(u, v)

        prev_node = u
        for i in range(1, n_segments):
            frac = i / n_segments
            new_lat = lat_u + frac * (lat_v - lat_u)
            new_lng = lng_u + frac * (lng_v - lng_u)
            new_z = None
            if z_u is not None and z_v is not None:
                new_z = z_u + frac * (z_v - z_u)

            new_id = f"verde_{uuid.uuid4().hex[:8]}"
            G.add_node(new_id, x=new_lng, y=new_lat, z=new_z, node_type="VERDE")

            seg_length = length / n_segments
            edge_data = {k: v_ for k, v_ in data.items() if k != "length_m"}
            edge_data["length_m"] = seg_length
            G.add_edge(prev_node, new_id, **edge_data)
            prev_node = new_id

        # Last segment to v
        seg_length = length / n_segments
        edge_data = {k: v_ for k, v_ in data.items() if k != "length_m"}
        edge_data["length_m"] = seg_length
        G.add_edge(prev_node, v, **edge_data)

    return G


def remove_redundant_nodes(
    G: nx.Graph,
    dist_min: float = REDUNDANT_NODE_MIN_DISTANCE,
    dist_max: float = LONG_EDGE_MAX_DISTANCE,
) -> nx.Graph:
    """Etapa 3 — Remoção de nós redundantes.

    Nós com grau 2 e distância < dist_min para ambos os vizinhos são
    marcados VERMELHO e removidos (arestas mescladas).

    Nós obrigatórios (pv_obrigatorio=True) nunca são removidos.

    Args:
        G: Grafo NetworkX.
        dist_min: Distância mínima entre nós (metros).
        dist_max: Distância máxima resultante após merge.

    Returns:
        Grafo modificado (in-place).
    """
    removed = True
    while removed:
        removed = False
        for node in list(G.nodes):
            if node not in G:
                continue
            ndata = G.nodes[node]
            if ndata.get("pv_obrigatorio", False):
                continue
            if G.degree(node) != 2:
                continue

            neighbors = list(G.neighbors(node))
            if len(neighbors) != 2:
                continue
            n1, n2 = neighbors

            d1 = G.edges[node, n1].get("length_m", float("inf"))
            d2 = G.edges[node, n2].get("length_m", float("inf"))

            if d1 >= dist_min or d2 >= dist_min:
                continue

            merged_length = d1 + d2
            if merged_length > dist_max:
                continue

            # Merge edges
            e1_data = dict(G.edges[node, n1])
            e2_data = dict(G.edges[node, n2])
            merged_data = {**e1_data, **e2_data, "length_m": merged_length}

            G.nodes[node]["node_type"] = "VERMELHO"
            G.remove_node(node)
            G.add_edge(n1, n2, **merged_data)
            removed = True

    return G


def resolve_curve_clusters(
    G: nx.Graph,
    angle_threshold: float = CURVE_ANGLE_THRESHOLD,
) -> nx.Graph:
    """Etapa 4 — Resolução de clusters de curva.

    Sequências de nós com ângulo interno < angle_threshold são
    substituídas por um único nó no ponto de interseção das
    tangentes de entrada e saída.

    Args:
        G: Grafo NetworkX.
        angle_threshold: Ângulo mínimo (graus). Nós com ângulo menor
                         formam uma curva acentuada.

    Returns:
        Grafo modificado (in-place).
    """
    processed = True
    while processed:
        processed = False
        for node in list(G.nodes):
            if node not in G:
                continue
            ndata = G.nodes[node]
            if ndata.get("pv_obrigatorio", False):
                continue
            if G.degree(node) != 2:
                continue

            neighbors = list(G.neighbors(node))
            if len(neighbors) != 2:
                continue
            n1, n2 = neighbors

            nd = G.nodes[node]
            n1d = G.nodes[n1]
            n2d = G.nodes[n2]

            a = (n1d["y"], n1d["x"])
            b = (nd["y"], nd["x"])
            c = (n2d["y"], n2d["x"])

            angle = angle_at_node(a, b, c)
            if angle >= angle_threshold:
                continue

            # Find intersection of tangent lines for better placement
            intersection = line_intersection(a, b, b, c)
            if intersection is not None:
                new_lat, new_lng = intersection
            else:
                new_lat, new_lng = b

            # Interpolate elevation
            z_n1 = n1d.get("z")
            z_n2 = n2d.get("z")
            new_z = None
            if z_n1 is not None and z_n2 is not None:
                new_z = (z_n1 + z_n2) / 2.0

            # Replace node with better-positioned one
            e1_data = dict(G.edges[node, n1])
            e2_data = dict(G.edges[node, n2])

            new_id = f"curve_{uuid.uuid4().hex[:8]}"
            G.remove_node(node)
            G.add_node(new_id, x=new_lng, y=new_lat, z=new_z, node_type="VERDE")
            G.add_edge(n1, new_id, **e1_data)
            G.add_edge(new_id, n2, **e2_data)
            processed = True

    return G


def detect_grade_breaks(
    G: nx.Graph,
    threshold: float = GRADE_BREAK_THRESHOLD,
) -> nx.Graph:
    """Mark degree-2 nodes where terrain slope changes abruptly as ROSA.

    When the slope difference between the two adjacent edges exceeds the
    threshold, a PV is needed to allow different pipe gradients on each side.

    Args:
        G: Graph with node attribute 'z' and edge attribute 'length_m'.
        threshold: Minimum slope change (m/m) to trigger PV.

    Returns:
        Graph modified in-place.
    """
    for node in list(G.nodes):
        if G.degree(node) != 2:
            continue
        ndata = G.nodes[node]
        if ndata.get("pv_obrigatorio"):
            continue

        z_n = ndata.get("z")
        if z_n is None:
            continue

        neighbors = list(G.neighbors(node))
        if len(neighbors) != 2:
            continue
        n1, n2 = neighbors

        z_1 = G.nodes[n1].get("z")
        z_2 = G.nodes[n2].get("z")
        if z_1 is None or z_2 is None:
            continue

        d1 = G.edges[node, n1].get("length_m", 1.0)
        d2 = G.edges[node, n2].get("length_m", 1.0)
        slope1 = abs(z_n - z_1) / max(d1, 0.1)
        slope2 = abs(z_n - z_2) / max(d2, 0.1)

        if abs(slope1 - slope2) > threshold:
            ndata["node_type"] = "ROSA"
            ndata["pv_obrigatorio"] = True

    return G


def subdivide_steep_edges(
    G: nx.Graph,
    max_slope: float = MAX_TERRAIN_SLOPE,
) -> nx.Graph:
    """Subdivide edges with terrain slope > max_slope.

    On steep terrain (>15%), pipe velocity exceeds 5 m/s even at DN150.
    Inserting intermediate nodes allows controlled gradients with drop
    manholes (tubos de queda / degraus) at each PV.

    Args:
        G: Graph with node attributes (x, y, z) and edge 'length_m'.
        max_slope: Maximum allowable terrain slope (m/m).

    Returns:
        Graph modified in-place.
    """
    edges_to_process = []
    for u, v, data in G.edges(data=True):
        z_u = G.nodes[u].get("z")
        z_v = G.nodes[v].get("z")
        length = data.get("length_m", 0)
        if z_u is None or z_v is None or length <= 0:
            continue

        terrain_slope = abs(z_u - z_v) / length
        if terrain_slope > max_slope:
            edges_to_process.append((u, v, data, length, terrain_slope))

    for u, v, data, length, terrain_slope in edges_to_process:
        if u not in G or v not in G or not G.has_edge(u, v):
            continue

        n_segments = math.ceil(terrain_slope / max_slope)
        if n_segments < 2:
            continue

        u_data = G.nodes[u]
        v_data = G.nodes[v]

        lat_u, lng_u = u_data["y"], u_data["x"]
        lat_v, lng_v = v_data["y"], v_data["x"]
        z_u = u_data.get("z")
        z_v = v_data.get("z")

        G.remove_edge(u, v)

        prev_node = u
        for i in range(1, n_segments):
            frac = i / n_segments
            new_lat = lat_u + frac * (lat_v - lat_u)
            new_lng = lng_u + frac * (lng_v - lng_u)
            new_z = None
            if z_u is not None and z_v is not None:
                new_z = z_u + frac * (z_v - z_u)

            new_id = f"steep_{uuid.uuid4().hex[:8]}"
            G.add_node(
                new_id, x=new_lng, y=new_lat, z=new_z,
                node_type="ROSA", pv_obrigatorio=True,
            )

            seg_length = length / n_segments
            edge_data = {k: v_ for k, v_ in data.items() if k != "length_m"}
            edge_data["length_m"] = seg_length
            G.add_edge(prev_node, new_id, **edge_data)
            prev_node = new_id

        seg_length = length / n_segments
        edge_data = {k: v_ for k, v_ in data.items() if k != "length_m"}
        edge_data["length_m"] = seg_length
        G.add_edge(prev_node, v, **edge_data)

    return G


def enforce_min_pv_spacing(
    G: nx.Graph,
    min_spacing: float = MIN_PV_SPACING,
) -> nx.Graph:
    """Merge PV nodes that are closer than min_spacing (80m).

    Only removes a node if:
    - It has degree 2 (not a real intersection)
    - Both it and a neighbor are pv_obrigatorio
    - It has no special criteria (grade break, direction change)
    - Edge between them < min_spacing

    Args:
        G: Graph.
        min_spacing: Minimum PV spacing (m).

    Returns:
        Graph modified in-place.
    """
    merged = True
    while merged:
        merged = False
        for node in list(G.nodes):
            if node not in G:
                continue
            ndata = G.nodes[node]
            if not ndata.get("pv_obrigatorio"):
                continue
            if G.degree(node) != 2:
                continue

            neighbors = list(G.neighbors(node))
            if len(neighbors) != 2:
                continue

            for nb in neighbors:
                if not G.nodes[nb].get("pv_obrigatorio"):
                    continue
                edge_len = G.edges[node, nb].get("length_m", float("inf"))
                if edge_len >= min_spacing:
                    continue

                # This PV is too close to another PV — remove and merge edges
                n1, n2 = neighbors
                other = n2 if nb == n1 else n1
                d1 = G.edges[node, n1].get("length_m", 0)
                d2 = G.edges[node, n2].get("length_m", 0)

                e1_data = dict(G.edges[node, n1])
                e2_data = dict(G.edges[node, n2])
                merged_data = {**e1_data, **e2_data, "length_m": d1 + d2}

                G.remove_node(node)
                if not G.has_edge(n1, n2):
                    G.add_edge(n1, n2, **merged_data)
                merged = True
                break

    return G
