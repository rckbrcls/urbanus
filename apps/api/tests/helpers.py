"""Factory functions for in-memory NetworkX graphs used in tests.

These helpers build small deterministic graphs with node attributes
(x=longitude, y=latitude, z=elevation) and edge attributes (length_m)
suitable for testing the sewer pipeline stages.
"""

from __future__ import annotations

import networkx as nx


def make_linear_graph(
    n: int = 5,
    length_m: float = 50.0,
    elevation_start: float = 100.0,
    slope: float = 0.02,
) -> nx.Graph:
    """Create a straight linear graph: A → B → C → D → E.

    Nodes decrease in elevation from start with given slope.
    All nodes have consistent x, y, z attributes.

    Args:
        n: Number of nodes.
        length_m: Length of each edge in meters.
        elevation_start: Elevation of first node.
        slope: Slope per segment (m/m). Positive = descending.

    Returns:
        nx.Graph with n nodes and n-1 edges.
    """
    G = nx.Graph()
    for i in range(n):
        node_id = f"N{i}"
        z = elevation_start - slope * length_m * i
        G.add_node(
            node_id,
            x=-46.65 + i * 0.001,  # lng
            y=-23.55,               # lat
            z=z,
            node_type="MANDATORY" if i in (0, n - 1) else None,
            pv_obrigatorio=(i in (0, n - 1)),
        )

    for i in range(n - 1):
        G.add_edge(f"N{i}", f"N{i+1}", length_m=length_m)

    return G


def make_y_graph(
    length_m: float = 50.0,
    elevation_start: float = 100.0,
) -> nx.Graph:
    """Create a Y-junction graph: two branches converging to outlet.

    Structure:
        A (100) → C (98) → D (96)  (outlet)
        B (100) ↗

    Args:
        length_m: Edge length.
        elevation_start: Starting elevation of branches.

    Returns:
        nx.Graph with 4 nodes.
    """
    G = nx.Graph()

    G.add_node("A", x=-46.66, y=-23.55, z=elevation_start, pv_obrigatorio=True)
    G.add_node("B", x=-46.66, y=-23.54, z=elevation_start, pv_obrigatorio=True)
    G.add_node("C", x=-46.65, y=-23.545, z=elevation_start - 2.0, pv_obrigatorio=True)
    G.add_node("D", x=-46.64, y=-23.545, z=elevation_start - 4.0, pv_obrigatorio=True)

    G.add_edge("A", "C", length_m=length_m)
    G.add_edge("B", "C", length_m=length_m)
    G.add_edge("C", "D", length_m=length_m)

    return G


def make_loop_graph() -> nx.Graph:
    """Create a graph with a cycle: A - B - C - D - A.

    All at same elevation to test robustness.
    """
    G = nx.Graph()

    nodes = {
        "A": (-46.65, -23.55, 100),
        "B": (-46.64, -23.55, 99),
        "C": (-46.64, -23.54, 98),
        "D": (-46.65, -23.54, 97),
    }
    for nid, (x, y, z) in nodes.items():
        G.add_node(nid, x=x, y=y, z=z, pv_obrigatorio=True)

    edges = [("A", "B"), ("B", "C"), ("C", "D"), ("D", "A")]
    for u, v in edges:
        G.add_edge(u, v, length_m=50.0)

    return G
