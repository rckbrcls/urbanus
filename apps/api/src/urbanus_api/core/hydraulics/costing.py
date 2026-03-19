"""
Cálculo de custo total da rede de esgoto.

Combina custos de tubulação (por diâmetro), escavação (quadrático com
profundidade) e elevatórias (VPL).
"""

from __future__ import annotations

import networkx as nx

from urbanus_geo.constants import EXCAVATION_A_COEF, EXCAVATION_B_COEF
from urbanus_geo.types import PipeSegment, PumpStation

# Tabela de custo por diâmetro (R$/m instalado) — referência regional
PIPE_COST_TABLE: dict[int, float] = {
    100: 60,
    150: 80,
    200: 120,
    250: 160,
    300: 220,
    400: 350,
    500: 500,
    600: 700,
    800: 1100,
    1000: 1600,
}


def compute_total_cost(
    pipes: list[PipeSegment],
    pump_stations: list[PumpStation],
    tree: nx.DiGraph,
) -> float:
    """Compute total network cost in R$.

    Cost = pipe_cost + excavation_cost + pump_cost

    Args:
        pipes: Dimensioned pipe segments.
        pump_stations: Pump stations from Etapa 7.
        tree: Directed tree (for edge lengths).

    Returns:
        Total cost (R$).
    """
    pipe_cost = 0.0
    excavation_cost = 0.0

    for p in pipes:
        # Parse edge length from tree
        parts = p.edge_id.split("->")
        if len(parts) == 2:
            u, v = parts
            length = tree.edges.get((u, v), {}).get("length_m", 0.0)
        else:
            length = 0.0

        # Pipe material cost
        unit_cost = PIPE_COST_TABLE.get(p.diameter_mm, 100.0)
        pipe_cost += unit_cost * length

        # Excavation cost (quadratic with depth)
        depth = p.cover_depth
        excavation_cost += (
            EXCAVATION_A_COEF * depth ** 2 + EXCAVATION_B_COEF * depth
        ) * length

    # Pump station NPV
    pump_cost = sum(ps.npv or 0.0 for ps in pump_stations)

    return pipe_cost + excavation_cost + pump_cost
