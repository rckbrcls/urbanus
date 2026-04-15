"""
Steps 3-5.5 - Sewer graph sanitization.

These helpers simplify the undirected street graph before gravity routing:
- Step 3 collapses short degree-2 nodes that are not mandatory.
- Step 4.5 collapses PV nodes that are too close to each other.
- Step 5.5 marks terrain grade breaks that should be preserved.
"""

from __future__ import annotations

import networkx as nx

from urbanus_geo.constants import (
    LONG_EDGE_MAX_DISTANCE,
    GRADE_BREAK_THRESHOLD,
    MIN_PV_SPACING,
    REDUNDANT_NODE_MIN_DISTANCE,
)
from urbanus_geo.types import NodeType
def remove_redundant_nodes(
    G: nx.Graph,
    dist_min: float = REDUNDANT_NODE_MIN_DISTANCE,
    dist_max: float = LONG_EDGE_MAX_DISTANCE,
) -> nx.Graph:
    """Remove short non-mandatory degree-2 nodes in-place.

    A node is removed only when it is a simple pass-through node, is not marked
    ``pv_obrigatorio``, both adjacent edges are shorter than ``dist_min``, and
    the merged edge would not exceed ``dist_max``. The two adjacent edges are
    replaced by one edge whose ``length_m`` is their sum.
    """
    changed = True
    while changed:
        changed = False
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

            e1_data = dict(G.edges[node, n1])
            e2_data = dict(G.edges[node, n2])
            merged_data = {**e1_data, **e2_data, "length_m": merged_length}

            G.nodes[node]["node_type"] = NodeType.REDUNDANT.value
            G.remove_node(node)
            G.add_edge(n1, n2, **merged_data)
            changed = True
            break

    return G


def enforce_min_pv_spacing(
    G: nx.Graph,
    min_spacing: float = MIN_PV_SPACING,
) -> nx.Graph:
    """Merge mandatory PV nodes that are closer than the spacing target.

    This collapses degree-2 PVs that are too close to another mandatory PV,
    but it preserves explicit collection points so sinks are not removed.
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

                n1, n2 = neighbors
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

            if merged:
                break

    return G


def detect_grade_breaks(
    G: nx.Graph,
    threshold: float = GRADE_BREAK_THRESHOLD,
) -> nx.Graph:
    """Mark degree-2 nodes with abrupt terrain slope changes as mandatory.

    When the slope difference between the two adjacent edges exceeds the
    threshold, the node is marked ``MANDATORY`` so the optimizer can preserve
    it if the grade break remains relevant. The function intentionally does not
    set ``pv_obrigatorio``; later merge checks still verify slope continuity.

    Args:
        G: Graph with node elevations in ``z`` and edge lengths in
            ``length_m``.
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
        # Use absolute terrain slopes on each side; direction is irrelevant
        # because this stage only decides whether the grade changes abruptly.
        slope1 = abs(z_n - z_1) / max(d1, 0.1)
        slope2 = abs(z_n - z_2) / max(d2, 0.1)

        if abs(slope1 - slope2) > threshold:
            ndata["node_type"] = NodeType.MANDATORY.value
            # NOT pv_obrigatorio: the optimizer checks slope break
            # before merging and will keep this node if truly needed.

    return G
