"""
Steps 3-5.5 - Sewer graph sanitization.

These helpers simplify the undirected street graph before gravity routing:
- Step 3 collapses short degree-2 nodes that are not mandatory.
- Step 4.5 collapses PV nodes that are too close to each other.
- Step 5.5 marks terrain grade breaks that should be preserved.
"""

from __future__ import annotations

from collections.abc import Callable

import networkx as nx

from urbanus_geo.constants import (
    GRADE_BREAK_THRESHOLD,
)
from urbanus_geo.types import NodeType


def collapse_degree2_nodes_by_distance(
    G: nx.Graph,
    *,
    should_collapse: Callable[[nx.Graph, str, tuple[str, str], float, float], bool],
) -> nx.Graph:
    """Collapse degree-2 nodes when a caller-defined distance rule matches.

    The function is intentionally generic so the pipeline can reuse the same
    merge mechanics for different business rules. Callers decide which nodes
    should be collapsed; this helper only performs the physical graph merge.
    """
    changed = True
    while changed:
        changed = False
        for node in list(G.nodes):
            if node not in G:
                continue
            if G.degree(node) != 2:
                continue

            neighbors = list(G.neighbors(node))
            if len(neighbors) != 2:
                continue
            n1, n2 = neighbors

            d1 = G.edges[node, n1].get("length_m", float("inf"))
            d2 = G.edges[node, n2].get("length_m", float("inf"))

            if not should_collapse(G, node, (n1, n2), d1, d2):
                continue

            e1_data = dict(G.edges[node, n1])
            e2_data = dict(G.edges[node, n2])
            merged_data = {**e1_data, **e2_data, "length_m": d1 + d2}

            G.remove_node(node)
            if not G.has_edge(n1, n2):
                G.add_edge(n1, n2, **merged_data)
            changed = True
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
