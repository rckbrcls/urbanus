"""
Atribuição de tipos de acessórios (PV, TIL, TL, CP) conforme NBR 9649.

Chamado após o dimensionamento (Etapa 8) para classificar cada nó da rede
com o acessório apropriado:
- PV: interseções (grau ≥ 3), mudança de direção >45°, mudança de diâmetro
- TIL: terminais (grau 1) em coletores DN ≤ 150mm
- TL: dead-ends onde não cabe PV completo
- CP: nós intermediários em trechos retos (apenas espaçamento)
"""

from __future__ import annotations

import networkx as nx

from urbanus_geo.constants import (
    DIRECTION_CHANGE_THRESHOLD,
    MIN_DIAMETER_COLLECTOR,
)
from urbanus_geo.calculations import angle_at_node
from urbanus_geo.types import PipeSegment


def assign_accessory_types(
    tree: nx.DiGraph,
    pipes: list[PipeSegment],
) -> nx.DiGraph:
    """Assign accessory types to all nodes in the sewer tree.

    Args:
        tree: Directed tree (result of Etapas 1-8).
        pipes: Dimensioned pipe segments from Etapa 8.

    Returns:
        Tree with updated 'accessory_type' node attributes.
    """
    # Build edge→diameter lookup
    edge_diameter: dict[str, int] = {}
    for p in pipes:
        edge_diameter[p.edge_id] = p.diameter_mm

    for node in tree.nodes:
        ndata = tree.nodes[node]

        in_deg = tree.in_degree(node)
        out_deg = tree.out_degree(node)
        total_deg = in_deg + out_deg

        # --- PV: intersections (degree ≥ 3 in the tree) ---
        if total_deg >= 3:
            ndata["accessory_type"] = "PV"
            continue

        # --- PV: direction change > threshold ---
        if total_deg == 2:
            preds = list(tree.predecessors(node))
            succs = list(tree.successors(node))
            if preds and succs:
                pred = preds[0]
                succ = succs[0]
                a = (tree.nodes[pred].get("y", 0), tree.nodes[pred].get("x", 0))
                b = (ndata.get("y", 0), ndata.get("x", 0))
                c = (tree.nodes[succ].get("y", 0), tree.nodes[succ].get("x", 0))
                angle = angle_at_node(a, b, c)
                deflection = 180.0 - angle
                if deflection > DIRECTION_CHANGE_THRESHOLD:
                    ndata["accessory_type"] = "PV"
                    continue

            # --- PV: diameter change between adjacent pipes ---
            in_diams = {
                edge_diameter.get(f"{p}->{node}")
                for p in preds
            } - {None}
            out_diams = {
                edge_diameter.get(f"{node}->{s}")
                for s in succs
            } - {None}
            if in_diams and out_diams and in_diams != out_diams:
                ndata["accessory_type"] = "PV"
                continue

            # --- CP: intermediate node, straight run, same diameter ---
            ndata["accessory_type"] = "CP"
            continue

        # --- Terminal nodes (degree 1) ---
        if total_deg == 1:
            # Check diameter of the single connected pipe
            connected_edges = list(tree.in_edges(node)) + list(tree.out_edges(node))
            if connected_edges:
                u, v = connected_edges[0]
                dn = edge_diameter.get(f"{u}->{v}", MIN_DIAMETER_COLLECTOR)
                if dn <= MIN_DIAMETER_COLLECTOR:
                    ndata["accessory_type"] = "TIL"
                else:
                    ndata["accessory_type"] = "PV"
            else:
                ndata["accessory_type"] = "TL"
            continue

        # Isolated nodes (shouldn't happen in a valid tree)
        ndata["accessory_type"] = "PV"

    return tree
