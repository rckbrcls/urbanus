"""
Etapa 7 — Resolução de pontos baixos e nós inalcançáveis.

Para cada nó AZUL_ESCURO ou unreachable, avalia três opções:
  A) Rota alternativa (Dijkstra excluindo arestas problemáticas)
  B) Escavação profunda (custo quadrático C(d) = a×d² + b×d)
  C) Elevatória (VPL com horizonte de 20 anos)

Escolhe a opção de menor custo.
"""

from __future__ import annotations

import uuid

import networkx as nx

from urbanus_geo.constants import (
    EXCAVATION_A_COEF,
    EXCAVATION_B_COEF,
    PUMP_CAPEX_MIN,
    PUMP_CAPEX_MAX,
    PUMP_HORIZON_YEARS,
    PUMP_DISCOUNT_RATE,
    MAX_GRAVITY_DEPTH,
    MIN_COVER_STREET,
)
from urbanus_geo.calculations import pump_npv, slope_2d
from urbanus_geo.types import PumpStation
from urbanus_api.core.routing.cost import edge_cost


def resolve_low_points(
    tree: nx.DiGraph,
    unreachable: list[str],
    G: nx.Graph,
    outlet: str,
) -> tuple[nx.DiGraph, list[PumpStation]]:
    """Resolve pontos baixos e nós sem conexão gravitacional.

    Args:
        tree: Árvore de escoamento atual (DiGraph).
        unreachable: Lista de nós sem caminho gravitacional.
        G: Grafo original completo.
        outlet: Nó de descarga.

    Returns:
        Tupla (updated_tree, pump_stations):
        - updated_tree: Árvore com nós resolvidos.
        - pump_stations: Lista de elevatórias adicionadas.
    """
    pump_stations: list[PumpStation] = []

    for node_id in unreachable:
        if node_id not in G:
            continue

        z_node = G.nodes[node_id].get("z")
        if z_node is None:
            continue

        # Option A: Alternative gravity route
        cost_a, path_a = _try_alternative_route(G, tree, node_id, outlet)

        # Option B: Deep excavation
        cost_b = _excavation_cost(z_node, MAX_GRAVITY_DEPTH)

        # Option C: Pump station
        cost_c, pump = _pump_station_cost(node_id, z_node)

        # Choose minimum cost
        best = min(
            ("route", cost_a),
            ("excavation", cost_b),
            ("pump", cost_c),
            key=lambda x: x[1],
        )

        if best[0] == "route" and path_a:
            # Add alternative route to tree
            for i in range(len(path_a) - 1):
                u, v = path_a[i], path_a[i + 1]
                if not tree.has_node(u):
                    tree.add_node(u, **G.nodes[u])
                if not tree.has_node(v):
                    tree.add_node(v, **G.nodes[v])
                if not tree.has_edge(u, v):
                    edata = G.edges.get((u, v), {})
                    tree.add_edge(u, v, **edata)

        elif best[0] == "pump":
            # Add pump station
            pump_stations.append(pump)
            # Add node to tree with pressurized edge
            if not tree.has_node(node_id):
                tree.add_node(node_id, **G.nodes[node_id])
            # Find nearest tree node to connect via pressure
            nearest = _find_nearest_tree_node(G, tree, node_id)
            if nearest:
                tree.add_edge(
                    node_id,
                    nearest,
                    length_m=G.edges.get((node_id, nearest), {}).get("length_m", 0),
                    is_pressurized=True,
                )

        else:
            # Deep excavation — just add to tree with extra depth
            if not tree.has_node(node_id):
                tree.add_node(node_id, **G.nodes[node_id], extra_depth=MAX_GRAVITY_DEPTH)
            nearest = _find_nearest_tree_node(G, tree, node_id)
            if nearest:
                tree.add_edge(node_id, nearest, **G.edges.get((node_id, nearest), {}))

    return tree, pump_stations


def _try_alternative_route(
    G: nx.Graph,
    tree: nx.DiGraph,
    node_id: str,
    outlet: str,
) -> tuple[float, list[str] | None]:
    """Try to find a gravity route avoiding existing problem edges."""
    try:
        path = nx.dijkstra_path(
            G, node_id, outlet,
            weight=lambda u, v, d: edge_cost(u, v, d, G),
        )
        cost = sum(
            edge_cost(path[i], path[i + 1], G.edges[path[i], path[i + 1]], G)
            for i in range(len(path) - 1)
        )
        return cost, path
    except (nx.NetworkXNoPath, nx.NodeNotFound):
        return float("inf"), None


def _excavation_cost(terrain_z: float, depth: float) -> float:
    """Custo de escavação profunda: C(d) = a×d² + b×d."""
    return EXCAVATION_A_COEF * depth ** 2 + EXCAVATION_B_COEF * depth


def _pump_station_cost(
    node_id: str,
    elevation: float,
) -> tuple[float, PumpStation]:
    """Calcula custo (VPL) de uma elevatória."""
    # Estimate capacity based on minimum flow
    capacity_ls = 7.5  # Conservative estimate
    head_m = MAX_GRAVITY_DEPTH  # Lift to overcome low point
    capex = PUMP_CAPEX_MIN  # Base cost for small station
    annual_opex = capex * 0.05  # ~5% of CAPEX per year

    npv = pump_npv(capex, annual_opex, PUMP_HORIZON_YEARS, PUMP_DISCOUNT_RATE)

    pump = PumpStation(
        id=f"pump_{uuid.uuid4().hex[:8]}",
        node_id=node_id,
        capacity_ls=capacity_ls,
        head_m=head_m,
        capex=capex,
        annual_opex=annual_opex,
        npv=npv,
    )
    return npv, pump


def _find_nearest_tree_node(
    G: nx.Graph,
    tree: nx.DiGraph,
    node_id: str,
) -> str | None:
    """Find the nearest node already in the tree."""
    best_dist = float("inf")
    best_node = None
    for tn in tree.nodes:
        if tn == node_id:
            continue
        if G.has_edge(node_id, tn):
            d = G.edges[node_id, tn].get("length_m", float("inf"))
            if d < best_dist:
                best_dist = d
                best_node = tn
    return best_node
