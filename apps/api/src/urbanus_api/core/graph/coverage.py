"""
Step 6.5 - Ensure full street coverage after RSPH.

RSPH builds the main gravity trunk from mandatory nodes, but it can omit street
edges that were not part of a cheapest path. This module adds those missing
edges back into the directed tree so every original street segment can receive
a collector. Added edges prefer gravity direction, then fall back to
connectivity heuristics when elevation is incomplete.
"""

from __future__ import annotations

import networkx as nx


def _would_create_cycle(tree: nx.DiGraph, src: str, dst: str) -> bool:
    """Return True if adding edge ``src -> dst`` would create a cycle.

    A cycle forms when ``dst`` already has a directed path back to ``src``.
    Missing nodes cannot create a cycle because NetworkX has no path to follow.

    Args:
        tree: Directed sewer graph that should remain acyclic.
        src: Candidate edge source.
        dst: Candidate edge target.

    Returns:
        ``True`` when adding ``src -> dst`` would break DAG invariants.
    """
    if src == dst:
        return True
    if not tree.has_node(dst) or not tree.has_node(src):
        return False
    return nx.has_path(tree, dst, src)


def ensure_full_coverage(tree: nx.DiGraph, G: nx.Graph) -> None:
    """Add every missing source-graph edge to the directed sewer tree.

    The function mutates ``tree`` in-place and does not return a value. It
    preserves existing tree edges, creates missing endpoint nodes, chooses a
    directed orientation for each missing edge, rejects orientations that would
    create cycles, and removes isolated nodes after coverage is restored.

    Args:
        tree: Directed tree produced by RSPH and previous repair passes.
        G: Complete sanitized undirected graph whose edges must be covered.
    """
    for u, v, data in G.edges(data=True):
        # A street segment already covered in either direction does not need a
        # duplicate collector edge.
        if tree.has_edge(u, v) or tree.has_edge(v, u):
            continue

        # Coverage repair can introduce nodes that RSPH never touched.
        if not tree.has_node(u):
            tree.add_node(u, **G.nodes[u])
        if not tree.has_node(v):
            tree.add_node(v, **G.nodes[v])

        # Prefer high-to-low direction whenever both elevations are known.
        z_u = G.nodes[u].get("z")
        z_v = G.nodes[v].get("z")

        if z_u is not None and z_v is not None:
            src, dst = (u, v) if z_u >= z_v else (v, u)
        elif z_u is not None:
            # With one known elevation, route toward the known terrain point so
            # the edge can connect into an already measured graph.
            src, dst = v, u
        elif z_v is not None:
            src, dst = u, v
        else:
            # With no terrain data, favor attaching the new segment into the
            # already-routed core rather than extending flow away from it.
            if _is_connected_to_tree_core(tree, u):
                src, dst = v, u
            else:
                src, dst = u, v

        if _would_create_cycle(tree, src, dst):
            # Gravity direction creates cycle. In a DAG, at most one
            # direction can create a cycle, so try the reverse.
            src, dst = dst, src
            if _would_create_cycle(tree, src, dst):
                # Both directions cycle, so the edge is already reachable.
                continue

        tree.add_edge(src, dst, **data)

    # Cleanup: remove isolated nodes (no edges at all)
    isolated = [n for n in tree.nodes if tree.in_degree(n) == 0 and tree.out_degree(n) == 0]
    tree.remove_nodes_from(isolated)


def _is_connected_to_tree_core(tree: nx.DiGraph, node: str) -> bool:
    """Return True when a node already participates in routed downstream flow.

    Args:
        tree: Directed sewer graph being repaired.
        node: Candidate node id.

    Returns:
        ``True`` when the node exists and has at least one outgoing edge.
    """
    return tree.has_node(node) and tree.out_degree(node) > 0
