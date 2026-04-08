"""
Atribuição simplificada de acessórios da rede.

Nesta fase do produto, todo nó físico da rede processada é classificado como
PV. O papel de ponto de coleta permanece separado via `is_collection_point`.
"""

from __future__ import annotations

import networkx as nx

from urbanus_geo.types import PipeSegment


def assign_accessory_types(
    tree: nx.DiGraph,
    pipes: list[PipeSegment],
) -> nx.DiGraph:
    """Assign PV to all nodes in the sewer tree.

    Args:
        tree: Directed tree (result of Etapas 1-8).
        pipes: Dimensioned pipe segments from Etapa 8. Unused here but kept
            for API compatibility with the processing pipeline.

    Returns:
        Tree with updated 'accessory_type' node attributes.
    """
    for node in tree.nodes:
        tree.nodes[node]["accessory_type"] = "PV"

    return tree
