"""
Função de custo para arestas do grafo de esgoto.

Combina custos de tubulação, escavação, penalidades por declividade
insuficiente, e penalidades por necessidade de bombeamento.
"""

from __future__ import annotations

import networkx as nx

from urbanus_geo.constants import (
    PIPE_UNIT_COST,
    EXCAVATION_A_COEF,
    EXCAVATION_B_COEF,
    SLOPE_PENALTY,
    PUMP_PENALTY,
    REUSE_BONUS,
    MIN_COVER_STREET,
)
from urbanus_geo.calculations import slope_2d


def edge_cost(
    u: str,
    v: str,
    data: dict,
    G: nx.Graph,
    reused_edges: set[tuple[str, str]] | None = None,
) -> float:
    """Calcula custo total de uma aresta para roteamento gravitacional.

    C_total = C_pipe + C_excavation + C_slope_penalty + C_pump

    Args:
        u: Nó de origem.
        v: Nó de destino.
        data: Atributos da aresta.
        G: Grafo com atributos de nó (z = elevação).
        reused_edges: Conjunto de arestas já usadas (desconto RSPH).

    Returns:
        Custo total (adimensional/normalizado).
    """
    length = data.get("length_m", 0.0)
    if length <= 0:
        return float("inf")

    z_u = G.nodes[u].get("z")
    z_v = G.nodes[v].get("z")

    # 1) Custo de tubulação (proporcional ao comprimento)
    c_pipe = PIPE_UNIT_COST * length

    # 2) Custo de escavação (quadrático com profundidade)
    depth = MIN_COVER_STREET  # mínimo de recobrimento
    c_excavation = (EXCAVATION_A_COEF * depth ** 2 + EXCAVATION_B_COEF * depth) * length

    # 3) Penalidade por declividade
    c_slope = 0.0
    if z_u is not None and z_v is not None:
        s = slope_2d(z_u, z_v, length)
        if s <= 0:
            # Fluxo contra a gravidade — pesada penalidade
            c_slope = PUMP_PENALTY
        elif s < 0.005:
            # Declividade muito baixa — penalidade proporcional
            c_slope = SLOPE_PENALTY * (0.005 - s) / 0.005 * length
    else:
        # Sem dados de elevação — penalidade moderada
        c_slope = SLOPE_PENALTY * length * 0.5

    # 4) Desconto para reutilização (RSPH)
    discount = 1.0
    if reused_edges and (u, v) in reused_edges:
        discount = REUSE_BONUS

    return (c_pipe + c_excavation + c_slope) * discount
