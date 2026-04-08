"""
Step 5 — Elevation analysis: local maxima and minima detection.

Labels nodes as:
- HIGH_POINT: all neighbors are lower
- LOW_POINT: all neighbors are higher

Prominence filtering via BFS reduces DEM noise false positives.
"""

from __future__ import annotations

from collections import deque

import networkx as nx

from urbanus_geo.constants import ELEVATION_PROMINENCE_MIN
from urbanus_geo.types import NodeType


def detect_extrema(
    G: nx.Graph,
    epsilon: float = 0.5,
    min_prominence: float = ELEVATION_PROMINENCE_MIN,
) -> nx.Graph:
    """Detecta máximos e mínimos locais de elevação no grafo.

    Args:
        G: Grafo NetworkX com atributo 'z' (elevação) nos nós.
        epsilon: Tolerância (m) para considerar vizinhos "iguais".
        min_prominence: Proeminência mínima (m) para classificar
                        como extremo real (evita ruído do DEM).

    Returns:
        Grafo modificado com node_type atualizado.
    """
    for node in G.nodes:
        ndata = G.nodes[node]
        z = ndata.get("z")
        if z is None:
            continue
        if ndata.get("pv_obrigatorio", False):
            continue

        neighbors = list(G.neighbors(node))
        if not neighbors:
            continue

        neighbor_elevs = []
        for nb in neighbors:
            nb_z = G.nodes[nb].get("z")
            if nb_z is not None:
                neighbor_elevs.append(nb_z)

        if not neighbor_elevs:
            continue

        # Check local maximum (all neighbors lower)
        all_lower = all(nz < z - epsilon for nz in neighbor_elevs)
        # Check local minimum (all neighbors higher)
        all_higher = all(nz > z + epsilon for nz in neighbor_elevs)

        if all_lower:
            prominence = _compute_prominence(G, node, z, direction="down")
            if prominence >= min_prominence:
                ndata["node_type"] = NodeType.HIGH_POINT.value
        elif all_higher:
            prominence = _compute_prominence(G, node, z, direction="up")
            if prominence >= min_prominence:
                ndata["node_type"] = NodeType.LOW_POINT.value

    return G


def _compute_prominence(
    G: nx.Graph,
    start: str,
    start_z: float,
    direction: str,
    max_hops: int = 20,
) -> float:
    """Compute topographic prominence of a local extremum via BFS.

    For a local maximum (direction="down"): prominence is the difference
    between start_z and the highest saddle point found by BFS.

    For a local minimum (direction="up"): prominence is the difference
    between the lowest saddle and start_z.

    Args:
        G: Graph.
        start: Starting node ID.
        start_z: Elevation at start node.
        direction: "down" for maxima, "up" for minima.
        max_hops: Maximum BFS depth.

    Returns:
        Prominence in meters.
    """
    visited = {start}
    queue: deque[tuple[str, int]] = deque()
    for nb in G.neighbors(start):
        queue.append((nb, 1))
        visited.add(nb)

    best_saddle = start_z  # worst case = no prominence

    while queue:
        node, depth = queue.popleft()
        if depth > max_hops:
            continue

        z = G.nodes[node].get("z")
        if z is None:
            continue

        if direction == "down":
            # Looking for the highest point we must cross to reach a higher peak
            best_saddle = min(best_saddle, z)
        else:
            best_saddle = max(best_saddle, z)

        for nb in G.neighbors(node):
            if nb not in visited:
                visited.add(nb)
                queue.append((nb, depth + 1))

    if direction == "down":
        return start_z - best_saddle
    else:
        return best_saddle - start_z
