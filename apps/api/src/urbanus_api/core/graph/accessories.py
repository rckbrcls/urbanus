"""
Simplified sewer accessory assignment.

At the current product stage every physical node that remains in the processed
network is represented as a PV. The collection-point role is kept separately in
``is_collection_point`` so routing semantics and rendered accessory type do not
overwrite each other.
"""

from __future__ import annotations

import networkx as nx


def assign_accessory_types(
    tree: nx.DiGraph,
) -> nx.DiGraph:
    """Set the rendered accessory type for every node in the sewer tree.

    This mutates the input tree in-place and returns it for pipeline chaining.
    No topology is changed here; the function only writes the
    ``accessory_type`` node attribute.

    Args:
        tree: Directed sewer network after routing and node optimization.

    Returns:
        The same tree with ``accessory_type`` set to ``"PV"`` on every node.
    """
    for node in tree.nodes:
        # Collection points are still PV structures; their sink role is stored
        # independently and consumed by the frontend through is_collection_point.
        tree.nodes[node]["accessory_type"] = "PV"

    return tree
