"""
Etapa 6 — Repeated Shortest Path Heuristic (RSPH) para roteamento gravitacional.

Constrói uma árvore de escoamento por gravidade conectando todos os nós
obrigatórios ao ponto de descarga (outlet) pelo caminho de menor custo.

O algoritmo:
1. Cria um grafo direcionado (alto → baixo = gravidade).
2. Para cada nó obrigatório, encontra o caminho mais barato até o outlet.
3. Arestas já usadas ganham desconto (REUSE_BONUS) para favorecer
   convergência em troncos coletores.
4. Nós sem caminho viável ficam em unreachable (resolver na Etapa 7).
"""

from __future__ import annotations

import networkx as nx

from urbanus_geo.calculations import slope_2d
from urbanus_api.core.routing.cost import edge_cost


def rsph_sewer_routing(
    G: nx.Graph,
    outlet: str,
    mandatory_nodes: set[str],
    collection_points: set[str] | None = None,
) -> tuple[nx.DiGraph, list[str]]:
    """Executa RSPH para rotear esgoto por gravidade.

    Supports multiple collection points via a virtual super-sink.
    Each mandatory node is routed to the nearest collection point
    (determined by Dijkstra cost), not necessarily to the global outlet.

    Args:
        G: Grafo não-direcionado com atributos (x, y, z) nos nós
           e (length_m) nas arestas.
        outlet: ID do nó de descarga (ponto mais baixo).
        mandatory_nodes: Conjunto de IDs de nós que devem ser conectados.
        collection_points: IDs dos pontos de coleta. If None, uses only
            the outlet as the single collection point.

    Returns:
        Tupla (tree, unreachable):
        - tree: DiGraph representando a árvore de escoamento.
        - unreachable: Lista de IDs de nós sem caminho gravitacional.
    """
    # 1. Criar grafo direcionado (gravidade: alto → baixo)
    DG = nx.DiGraph()
    for node, data in G.nodes(data=True):
        DG.add_node(node, **data)

    for u, v, data in G.edges(data=True):
        z_u = G.nodes[u].get("z")
        z_v = G.nodes[v].get("z")

        if z_u is not None and z_v is not None:
            if z_u >= z_v:
                DG.add_edge(u, v, **data)
            if z_v >= z_u:
                DG.add_edge(v, u, **data)
        else:
            # Without elevation data, allow both directions
            DG.add_edge(u, v, **data)
            DG.add_edge(v, u, **data)

    # 2. Virtual super-sink for multiple collection points
    sinks = collection_points or set()
    sinks = sinks | {outlet}  # outlet is always a collection point

    SUPER_SINK = "__super_sink__"
    DG.add_node(SUPER_SINK)
    for cp in sinks:
        if cp in DG:
            DG.add_edge(cp, SUPER_SINK, length_m=0)

    # 3. Iteratively connect mandatory nodes to nearest collection point
    tree = nx.DiGraph()
    for cp in sinks:
        if cp in G:
            tree.add_node(cp, **G.nodes[cp])
    reused_edges: set[tuple[str, str]] = set()
    unreachable: list[str] = []

    # Sort by elevation descending (highest first → longest paths first).
    sorted_nodes = sorted(
        mandatory_nodes - sinks,
        key=lambda n: (G.nodes[n].get("z") is None, -(G.nodes[n].get("z") or 0)),
    )

    for node in sorted_nodes:
        if node not in DG:
            unreachable.append(node)
            continue

        try:
            path = nx.dijkstra_path(
                DG,
                node,
                SUPER_SINK,
                weight=lambda u, v, d: edge_cost(u, v, d, G, reused_edges),
            )
        except nx.NetworkXNoPath:
            unreachable.append(node)
            continue

        # Add path to tree (excluding the virtual super-sink)
        for i in range(len(path) - 1):
            u, v = path[i], path[i + 1]
            if v == SUPER_SINK:
                break  # Don't add super-sink to real tree
            if not tree.has_node(u):
                tree.add_node(u, **DG.nodes[u])
            if not tree.has_node(v):
                tree.add_node(v, **DG.nodes[v])
            if not tree.has_edge(u, v):
                tree.add_edge(u, v, **DG.edges[u, v])
            reused_edges.add((u, v))

    # Cleanup: remove super-sink
    DG.remove_node(SUPER_SINK)

    return tree, unreachable
