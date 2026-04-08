"""
Etapas 3-4 — Sanitização do grafo de rede de esgoto.

Etapa 3: Remoção de nós redundantes (< dist_min) marcados VERMELHO.
Etapa 4: Resolução de clusters de curva (ângulo < threshold).
"""

from __future__ import annotations

import math

import networkx as nx

from urbanus_geo.calculations import haversine, angle_at_node, line_intersection
from urbanus_geo.constants import (
    REDUNDANT_NODE_MIN_DISTANCE,
    CURVE_ANGLE_THRESHOLD,
    GRADE_BREAK_THRESHOLD,
    MIN_PV_SPACING,
    SNAP_DISTANCE_METERS,
)


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
                continue

            # The tangent-intersection heuristic can degenerate to the
            # original vertex position. Replacing the node with an
            # identical one makes no progress and causes the outer loop
            # to repeat forever on frontend-edited graphs.
            if math.isclose(new_lat, nd["y"], abs_tol=1e-9) and math.isclose(new_lng, nd["x"], abs_tol=1e-9):
                continue

            # Interpolate elevation
            z_n1 = n1d.get("z")
            z_n2 = n2d.get("z")
            new_z = None
            if z_n1 is not None and z_n2 is not None:
                new_z = (z_n1 + z_n2) / 2.0

            # Replace node with better-positioned one
            e1_data = dict(G.edges[node, n1])
            e2_data = dict(G.edges[node, n2])

            new_id = f"curve_{n1}_{n2}"
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
            # NOT pv_obrigatorio — the optimizer checks slope break
            # before merging and will keep this node if truly needed.

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
