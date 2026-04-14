"""
Step 6 - Repeated Shortest Path Heuristic (RSPH) for gravity routing.

RSPH builds a directed sewer flow tree by connecting mandatory nodes to one of
the available collection points. Edges are oriented downhill when elevation is
known, each mandatory node is connected through the least-cost Dijkstra path,
and edges already inserted in the tree become cheaper so future paths converge
into collector trunks. Nodes without a feasible gravity path are reported as
unreachable instead of being forced into the tree.
"""

from __future__ import annotations

import networkx as nx
from urbanus_api.core.routing.cost import edge_cost


def rsph_sewer_routing(
    G: nx.Graph,
    outlet: str,
    mandatory_nodes: set[str],
    collection_points: set[str] | None = None,
) -> tuple[nx.DiGraph, list[str]]:
    """Route mandatory nodes into a directed sewer tree.

    Multiple collection points are modeled by adding a temporary virtual
    super-sink connected by zero-length edges. Dijkstra can then choose the
    cheapest sink for each mandatory node without special-case branching.

    Args:
        G: Undirected source graph with node coordinates/elevation (``x``,
            ``y``, ``z``) and edge lengths in ``length_m``.
        outlet: Fallback discharge node. It is always treated as a sink.
        mandatory_nodes: Node ids that must be routed if a path exists.
        collection_points: Optional sink node ids. When omitted, only the
            outlet is used.

    Returns:
        A tuple ``(tree, unreachable)`` where ``tree`` is the directed sewer
        flow tree and ``unreachable`` contains mandatory nodes with no path.
    """
    # Convert the undirected street graph into a directed gravity graph.
    DG = nx.DiGraph()
    for node, data in G.nodes(data=True):
        DG.add_node(node, **data)

    for u, v, data in G.edges(data=True):
        z_u = G.nodes[u].get("z")
        z_v = G.nodes[v].get("z")

        if z_u is not None and z_v is not None:
            # Equal elevations intentionally allow both directions; the cost
            # function will still reject non-positive slopes when appropriate.
            if z_u >= z_v:
                DG.add_edge(u, v, **data)
            if z_v >= z_u:
                DG.add_edge(v, u, **data)
        else:
            # With incomplete terrain data, keep both directions available and
            # let edge_cost apply the missing-elevation penalty.
            DG.add_edge(u, v, **data)
            DG.add_edge(v, u, **data)

    # A virtual super-sink lets one Dijkstra call route to the cheapest sink.
    sinks = collection_points or set()
    sinks = sinks | {outlet}

    SUPER_SINK = "__super_sink__"
    DG.add_node(SUPER_SINK)
    for cp in sinks:
        if cp in DG:
            DG.add_edge(cp, SUPER_SINK, length_m=0)

    # Seed the output tree with all real sinks so routed branches can terminate.
    tree = nx.DiGraph()
    for cp in sinks:
        if cp in G:
            tree.add_node(cp, **G.nodes[cp])
    reused_edges: set[tuple[str, str]] = set()
    unreachable: list[str] = []

    # Higher nodes are routed first because they tend to produce the longest
    # trunk paths; later lower nodes can then reuse those trunks at a discount.
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

        # Copy only real graph nodes/edges into the result; the super-sink is
        # an internal routing trick and must never appear in API output.
        for i in range(len(path) - 1):
            u, v = path[i], path[i + 1]
            if v == SUPER_SINK:
                break
            if not tree.has_node(u):
                tree.add_node(u, **DG.nodes[u])
            if not tree.has_node(v):
                tree.add_node(v, **DG.nodes[v])
            if not tree.has_edge(u, v):
                tree.add_edge(u, v, **DG.edges[u, v])
            reused_edges.add((u, v))

    # Keep the temporary directed graph clean for easier debugging.
    DG.remove_node(SUPER_SINK)

    return tree, unreachable
