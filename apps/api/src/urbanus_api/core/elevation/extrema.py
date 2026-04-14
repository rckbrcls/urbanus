"""
Step 5 - Elevation analysis: local maxima and minima detection.

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
    """Mark local elevation maxima and minima in-place.

    A node becomes ``HIGH_POINT`` when every neighbor is lower by more than
    ``epsilon`` and the surrounding terrain gives it enough prominence. It
    becomes ``LOW_POINT`` under the mirrored condition. Mandatory PV nodes are
    skipped because structural constraints should not be overwritten by terrain
    classification.

    Args:
        G: Graph whose nodes store terrain elevation in ``z``.
        epsilon: Elevation tolerance, in meters, for treating neighbors as
            effectively level.
        min_prominence: Minimum prominence, in meters, required to filter out
            DEM noise and tiny local oscillations.

    Returns:
        The same graph instance, with ``node_type`` updated where applicable.
    """
    for node in G.nodes:
        ndata = G.nodes[node]
        z = ndata.get("z")
        if z is None:
            continue
        if ndata.get("pv_obrigatorio", False):
            # Do not downgrade or reinterpret nodes the user/pipeline already
            # decided must be preserved as physical PVs.
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

        # A local extremum must be clearly above/below every known neighbor.
        all_lower = all(nz < z - epsilon for nz in neighbor_elevs)
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
    """Estimate local topographic prominence for an extremum via BFS.

    For a local maximum (``direction="down"``), prominence is estimated as the
    drop from ``start_z`` to the lowest nearby sampled elevation. For a local
    minimum (``direction="up"``), it is estimated as the rise from ``start_z``
    to the highest nearby sampled elevation. This is a bounded local heuristic,
    not a full watershed/saddle analysis.

    Args:
        G: Graph with node elevations in ``z``.
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

    # The bounded BFS samples nearby terrain without letting a distant hill or
    # valley dominate a small local classification decision.
    while queue:
        node, depth = queue.popleft()
        if depth > max_hops:
            continue

        z = G.nodes[node].get("z")
        if z is None:
            continue

        if direction == "down":
            # For peaks, lower saddles increase the visible drop.
            best_saddle = min(best_saddle, z)
        else:
            # For pits, higher saddles increase the visible rise.
            best_saddle = max(best_saddle, z)

        for nb in G.neighbors(node):
            if nb not in visited:
                visited.add(nb)
                queue.append((nb, depth + 1))

    if direction == "down":
        return start_z - best_saddle
    else:
        return best_saddle - start_z
