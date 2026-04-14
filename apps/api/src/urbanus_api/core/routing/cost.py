"""
Heuristic routing cost for sewer graph edges.

The value returned here is not a construction price. It is an ordering score
used by Dijkstra inside RSPH: shorter downhill edges are preferred, shallow
slopes are penalized, non-gravity edges are rejected, and already-used edges
can receive a reuse discount to encourage trunk collectors.
"""

from __future__ import annotations

import networkx as nx

from urbanus_geo.constants import (
    SLOPE_PENALTY,
    REUSE_BONUS,
)
from urbanus_geo.calculations import slope_2d


def edge_cost(
    u: str,
    v: str,
    data: dict,
    G: nx.Graph,
    reused_edges: set[tuple[str, str]] | None = None,
) -> float:
    """Return the routing score for one directed candidate edge.

    The input edge is interpreted as ``u -> v``. A valid candidate must have a
    positive length and, when both endpoints have elevation, must have a
    positive downhill slope according to ``slope_2d``. Missing elevation does
    not make the edge unusable, but it receives a conservative penalty because
    gravity cannot be verified.

    Args:
        u: Source node id for the directed candidate edge.
        v: Target node id for the directed candidate edge.
        data: Edge attributes; ``length_m`` is required for a finite cost.
        G: Graph that stores node elevations in the ``z`` attribute.
        reused_edges: Directed edges already included in the RSPH tree.

    Returns:
        Dimensionless routing score, or ``inf`` when the edge is unusable.
    """
    length = data.get("length_m", 0.0)
    if length <= 0:
        return float("inf")

    z_u = G.nodes[u].get("z")
    z_v = G.nodes[v].get("z")

    # Start from physical length so Dijkstra naturally prefers shorter routes.
    cost = length

    # Gravity is enforceable only when both endpoint elevations are known.
    if z_u is not None and z_v is not None:
        s = slope_2d(z_u, z_v, length)
        if s <= 0:
            return float("inf")
        elif s < 0.005:
            # Very shallow downhill edges remain possible but become expensive.
            cost += SLOPE_PENALTY * (0.005 - s) / 0.005 * length
    else:
        # Missing elevation keeps routing possible while making known terrain
        # preferable whenever there is a similarly short alternative.
        cost += SLOPE_PENALTY * length * 0.5

    discount = 1.0
    if reused_edges and (u, v) in reused_edges:
        # Reused edges make later paths converge into the same collector trunk.
        discount = REUSE_BONUS

    return cost * discount
