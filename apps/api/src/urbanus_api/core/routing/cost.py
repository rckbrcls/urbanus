"""
Custo heuristico de roteamento para arestas do grafo de esgoto.

Nao representa preco em dinheiro. Prioriza trechos mais curtos e penaliza
declividades insuficientes.
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
    """Calcula um custo heuristico de roteamento para uma aresta.

    Args:
        u: Nó de origem.
        v: Nó de destino.
        data: Atributos da aresta.
        G: Grafo com atributos de nó (z = elevação).
        reused_edges: Conjunto de arestas já usadas (desconto RSPH).

    Returns:
        Custo de roteamento (adimensional).
    """
    length = data.get("length_m", 0.0)
    if length <= 0:
        return float("inf")

    z_u = G.nodes[u].get("z")
    z_v = G.nodes[v].get("z")

    # Base: trecho mais curto é preferível.
    cost = length

    # Penalidade por declividade muito baixa.
    if z_u is not None and z_v is not None:
        s = slope_2d(z_u, z_v, length)
        if s <= 0:
            return float("inf")
        elif s < 0.005:
            cost += SLOPE_PENALTY * (0.005 - s) / 0.005 * length
    else:
        cost += SLOPE_PENALTY * length * 0.5

    discount = 1.0
    if reused_edges and (u, v) in reused_edges:
        discount = REUSE_BONUS

    return cost * discount
