"""
Etapa 6.5 — Garantir cobertura total da rede.

Após o RSPH construir a árvore principal (tronco coletor),
adiciona de volta TODAS as arestas do grafo original que não
foram incluídas na árvore. Cada rua precisa de um coletor —
casas ao longo de arestas descartadas ficariam sem esgoto.

Para cada aresta adicionada:
- Direção gravitacional (alto → baixo) se ambos nós têm elevação.
- Se só um tem elevação, a aresta aponta para o nó com elevação.
- Se nenhum tem, usa a direção original do grafo.

Após adicionar todas as arestas, faz limpeza final:
- Remove nós isolados (grau 0).
- Remove nós intermediários redundantes (grau 2 total, não-obrigatórios)
  mesclando suas arestas — minimiza custo de construção de PVs.
"""

from __future__ import annotations

import networkx as nx


def _would_create_cycle(tree: nx.DiGraph, src: str, dst: str) -> bool:
    """Return True if adding edge src→dst would create a cycle.

    A cycle forms if dst already has a directed path to src in the tree.
    """
    if src == dst:
        return True
    if not tree.has_node(dst) or not tree.has_node(src):
        return False
    return nx.has_path(tree, dst, src)


def ensure_full_coverage(tree: nx.DiGraph, G: nx.Graph) -> None:
    """Adiciona ao ``tree`` todas as arestas de ``G`` que ainda não existem.

    Modifica ``tree`` in-place. After adding edges, cleans up:
    - Isolated nodes (degree 0)
    - Redundant intermediate nodes (total degree 2, not mandatory)

    Args:
        tree: Árvore de escoamento (resultado do RSPH + low_points).
        G: Grafo original completo (não-direcionado).
    """
    for u, v, data in G.edges(data=True):
        # Skip if edge already in tree (either direction)
        if tree.has_edge(u, v) or tree.has_edge(v, u):
            continue

        # Ensure both nodes exist in tree
        if not tree.has_node(u):
            tree.add_node(u, **G.nodes[u])
        if not tree.has_node(v):
            tree.add_node(v, **G.nodes[v])

        # Determine direction: high → low (gravity)
        z_u = G.nodes[u].get("z")
        z_v = G.nodes[v].get("z")

        if z_u is not None and z_v is not None:
            src, dst = (u, v) if z_u >= z_v else (v, u)
        elif z_u is not None:
            src, dst = v, u
        elif z_v is not None:
            src, dst = u, v
        else:
            if _is_connected_to_tree_core(tree, u):
                src, dst = v, u
            else:
                src, dst = u, v

        if _would_create_cycle(tree, src, dst):
            # Gravity direction creates cycle. In a DAG, at most one
            # direction can create a cycle — try the reverse.
            src, dst = dst, src
            if _would_create_cycle(tree, src, dst):
                # Both directions cycle → edge already reachable
                continue

        tree.add_edge(src, dst, **data)

    # Cleanup: remove isolated nodes (no edges at all)
    isolated = [n for n in tree.nodes if tree.in_degree(n) == 0 and tree.out_degree(n) == 0]
    tree.remove_nodes_from(isolated)


def reduce_pass_through_nodes(tree: nx.DiGraph, max_edge_length: float) -> None:
    """Remove non-mandatory degree-2 pass-through nodes, merging their edges.

    A pass-through node has exactly 1 incoming and 1 outgoing edge — the pipe
    just runs through it without branching. Removing it and merging the two
    edges into one eliminates an unnecessary manhole (PV), reducing cost.

    Only removes a node when:
    - It is NOT ``pv_obrigatorio``
    - It has exactly 1 predecessor and 1 successor (simple pass-through)
    - The merged edge length ≤ ``max_edge_length``

    Nodes with 2+ incoming or 2+ outgoing edges are real junctions and are
    kept regardless of their ``pv_obrigatorio`` flag.

    Args:
        tree: Directed sewer network (modified in-place).
        max_edge_length: Maximum allowed length for merged edge (m).
    """
    changed = True
    while changed:
        changed = False
        for node in list(tree.nodes):
            if node not in tree:
                continue
            if tree.nodes[node].get("pv_obrigatorio"):
                continue
            if tree.in_degree(node) != 1 or tree.out_degree(node) != 1:
                continue

            pred = next(tree.predecessors(node))
            succ = next(tree.successors(node))
            if pred == succ:
                continue

            d1 = tree.edges[pred, node].get("length_m", 0)
            d2 = tree.edges[node, succ].get("length_m", 0)
            merged_length = d1 + d2

            if merged_length > max_edge_length:
                continue

            e1 = dict(tree.edges[pred, node])
            e2 = dict(tree.edges[node, succ])
            merged_data = {**e1, **e2, "length_m": merged_length}

            tree.remove_node(node)
            if not tree.has_edge(pred, succ):
                tree.add_edge(pred, succ, **merged_data)
            changed = True


def _is_connected_to_tree_core(tree: nx.DiGraph, node: str) -> bool:
    """Check if a node has any outgoing edges in the tree (i.e., is already routed)."""
    return tree.has_node(node) and tree.out_degree(node) > 0
