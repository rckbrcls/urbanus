"""
Alternativa ao RSPH: Minimum Spanning Arborescence (Edmonds/Chu-Liu).

Encontra a arborescência de custo mínimo enraizada no outlet,
garantindo que todos os nós alcançáveis sejam conectados de forma ótima.

NetworkX implementa Edmonds' algorithm em minimum_spanning_arborescence().
"""

from __future__ import annotations

import networkx as nx

from urbanus_api.core.routing.cost import edge_cost


def edmonds_sewer_routing(
    G: nx.Graph,
    outlet: str,
) -> tuple[nx.DiGraph, list[str]]:
    """Constrói arborescência mínima com Edmonds/Chu-Liu.

    Todos os nós alcançáveis a partir do outlet (por gravidade reversa)
    são incluídos. Nós inalcançáveis vão para unreachable.

    Args:
        G: Grafo não-direcionado com atributos nos nós e arestas.
        outlet: ID do nó de descarga (raiz da arborescência).

    Returns:
        Tupla (tree, unreachable).
    """
    # Build directed graph (gravity: high → low → outlet)
    DG = nx.DiGraph()
    for node, data in G.nodes(data=True):
        DG.add_node(node, **data)

    for u, v, data in G.edges(data=True):
        z_u = G.nodes[u].get("z")
        z_v = G.nodes[v].get("z")
        cost = edge_cost(u, v, data, G)

        if z_u is not None and z_v is not None:
            if z_u >= z_v:
                DG.add_edge(u, v, weight=cost, **data)
            if z_v >= z_u:
                cost_rev = edge_cost(v, u, data, G)
                DG.add_edge(v, u, weight=cost_rev, **data)
        else:
            DG.add_edge(u, v, weight=cost, **data)
            DG.add_edge(v, u, weight=cost, **data)

    # Find reachable nodes (can reach outlet)
    # We reverse the graph: edges point outlet → sources
    DG_rev = DG.reverse()
    reachable = set(nx.descendants(DG_rev, outlet)) | {outlet}
    unreachable = [n for n in DG.nodes if n not in reachable]

    # Subgraph of reachable nodes only
    sub = DG.subgraph(reachable).copy()

    if len(sub) <= 1:
        tree = nx.DiGraph()
        tree.add_node(outlet, **G.nodes[outlet])
        return tree, unreachable

    try:
        tree = nx.minimum_spanning_arborescence(sub, attr="weight")
        # Copy node attributes
        for node in tree.nodes:
            tree.nodes[node].update(sub.nodes[node])
    except nx.NetworkXException:
        # Fallback: return empty tree
        tree = nx.DiGraph()
        tree.add_node(outlet, **G.nodes[outlet])
        unreachable = [n for n in G.nodes if n != outlet]

    return tree, unreachable
