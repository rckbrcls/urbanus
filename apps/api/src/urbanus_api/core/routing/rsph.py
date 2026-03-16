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
) -> tuple[nx.DiGraph, list[str]]:
    """Executa RSPH para rotear esgoto por gravidade.

    Args:
        G: Grafo não-direcionado com atributos (x, y, z) nos nós
           e (length_m) nas arestas.
        outlet: ID do nó de descarga (ponto mais baixo).
        mandatory_nodes: Conjunto de IDs de nós que devem ser conectados.

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

    # 2. Iteratively connect mandatory nodes to outlet
    tree = nx.DiGraph()
    tree.add_node(outlet, **DG.nodes[outlet])
    reused_edges: set[tuple[str, str]] = set()
    unreachable: list[str] = []

    # Sort by elevation descending (highest first → longest paths first)
    sorted_nodes = sorted(
        mandatory_nodes - {outlet},
        key=lambda n: G.nodes[n].get("z", 0) or 0,
        reverse=True,
    )

    for node in sorted_nodes:
        if node not in DG:
            unreachable.append(node)
            continue

        try:
            # Dijkstra with custom weight function
            path = nx.dijkstra_path(
                DG,
                node,
                outlet,
                weight=lambda u, v, d: edge_cost(u, v, d, G, reused_edges),
            )
        except nx.NetworkXNoPath:
            unreachable.append(node)
            continue

        # Add path to tree
        for i in range(len(path) - 1):
            u, v = path[i], path[i + 1]
            if not tree.has_node(u):
                tree.add_node(u, **DG.nodes[u])
            if not tree.has_node(v):
                tree.add_node(v, **DG.nodes[v])
            if not tree.has_edge(u, v):
                tree.add_edge(u, v, **DG.edges[u, v])
            reused_edges.add((u, v))

    return tree, unreachable
