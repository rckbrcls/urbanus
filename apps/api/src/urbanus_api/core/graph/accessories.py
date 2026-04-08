"""
Atribuição simplificada de acessórios da rede.

Nesta fase do produto, todo nó físico da rede processada é classificado como
PV. O papel de ponto de coleta permanece separado via `is_collection_point`.
"""

from __future__ import annotations

import networkx as nx


def assign_accessory_types(
    tree: nx.DiGraph,
) -> nx.DiGraph:
    """Assign PV to all nodes in the sewer tree.

    Args:
        tree: Directed tree (result of Etapas 1-8).

    Returns:
        Tree with updated 'accessory_type' node attributes.
    """
    for node in tree.nodes:
        tree.nodes[node]["accessory_type"] = "PV"

    return tree
