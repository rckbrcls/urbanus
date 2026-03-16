"""
Etapa 8 — Dimensionamento hidráulico da rede.

Para cada trecho da árvore de escoamento:
1. Estima vazão (população × per capita × coeficientes)
2. Calcula declividade mínima (I_min = 0.0055 × Qi^-0.47)
3. Itera diâmetros DN até satisfazer:
   - τ ≥ 1.0 Pa (tensão trativa)
   - y/D ≤ 0.75 (lâmina)
   - V ≤ 5.0 m/s (velocidade)
4. Calcula custo total
"""

from __future__ import annotations

import math

import networkx as nx

from urbanus_geo.constants import (
    MANNING_N_DEFAULT,
    MIN_TRACTIVE_STRESS,
    MAX_FLOW_DEPTH_RATIO,
    MAX_VELOCITY,
    MIN_FLOW_RATE,
    PIPE_DIAMETERS,
    MIN_DIAMETER_COLLECTOR,
    MIN_COVER_STREET,
)
from urbanus_geo.calculations import (
    manning_velocity,
    hydraulic_radius_partial,
    tractive_stress,
    min_slope,
    slope_2d,
    sewage_flow_estimate,
    peak_flow,
)
from urbanus_geo.types import PipeSegment


def dimension_network(
    tree: nx.DiGraph,
    population_per_node: float = 50.0,
) -> list[PipeSegment]:
    """Dimensiona todos os trechos da árvore de escoamento.

    Args:
        tree: DiGraph representando a rede de esgoto (Etapas 1-7).
        population_per_node: Estimativa de população por nó de contribuição.

    Returns:
        Lista de PipeSegment com dimensionamento completo.
    """
    pipes: list[PipeSegment] = []

    # Calculate contributing population upstream of each edge
    # (topological sort: leaves → root)
    topo_order = list(nx.topological_sort(tree))

    # Accumulate upstream node count
    upstream_count: dict[str, int] = {}
    for node in reversed(topo_order):
        count = 1
        for pred in tree.predecessors(node):
            count += upstream_count.get(pred, 1)
        upstream_count[node] = count

    for u, v, data in tree.edges(data=True):
        if data.get("is_pressurized", False):
            # Pressurized pipe — different dimensioning (skip for now)
            pipes.append(PipeSegment(
                edge_id=f"{u}->{v}",
                diameter_mm=MIN_DIAMETER_COLLECTOR,
                manning_n=MANNING_N_DEFAULT,
                slope=0.0,
                cover_depth=MIN_COVER_STREET,
                is_pressurized=True,
            ))
            continue

        length = data.get("length_m", 0.0)
        z_u = tree.nodes[u].get("z")
        z_v = tree.nodes[v].get("z")

        # Slope
        if z_u is not None and z_v is not None and length > 0:
            s = slope_2d(z_u, z_v, length)
        else:
            s = 0.005  # Default moderate slope

        s = max(s, 0.0001)  # Prevent zero/negative

        # Estimate flow
        contributing_pop = upstream_count.get(u, 1) * population_per_node
        q_d = sewage_flow_estimate(int(contributing_pop))
        q_peak = peak_flow(q_d)
        q_design = max(q_peak, MIN_FLOW_RATE)

        # Minimum slope for this flow
        i_min = min_slope(q_design)
        slope_used = max(s, i_min)

        # Iterate diameters to find smallest that satisfies all criteria
        pipe = _select_diameter(
            edge_id=f"{u}->{v}",
            slope=slope_used,
            q_design_ls=q_design,
            cover_depth=MIN_COVER_STREET,
        )
        pipes.append(pipe)

    return pipes


def _select_diameter(
    edge_id: str,
    slope: float,
    q_design_ls: float,
    cover_depth: float,
    n: float = MANNING_N_DEFAULT,
) -> PipeSegment:
    """Select minimum pipe diameter satisfying NBR 9649 constraints.

    Iterates through standard diameters and checks:
    - Tractive stress ≥ MIN_TRACTIVE_STRESS
    - Flow depth ratio ≤ MAX_FLOW_DEPTH_RATIO
    - Velocity ≤ MAX_VELOCITY

    Args:
        edge_id: Edge identifier.
        slope: Design slope (m/m).
        q_design_ls: Design flow rate (L/s).
        cover_depth: Minimum cover depth (m).
        n: Manning's coefficient.

    Returns:
        PipeSegment with the selected diameter and computed properties.
    """
    q_design_m3s = q_design_ls / 1000.0

    for dn in PIPE_DIAMETERS:
        if dn < MIN_DIAMETER_COLLECTOR:
            continue

        d_m = dn / 1000.0  # Convert mm to m

        # Find flow depth that produces the design flow
        # Binary search for y/D ratio
        lo, hi = 0.01, MAX_FLOW_DEPTH_RATIO
        best_yd = None
        best_v = None
        best_tau = None

        for _ in range(50):  # Binary search iterations
            mid = (lo + hi) / 2.0
            depth = mid * d_m
            rh = hydraulic_radius_partial(d_m, depth)
            v = manning_velocity(rh, slope, n)

            # Flow area for partial fill
            theta = 2.0 * math.acos(max(-1, min(1, 1.0 - 2.0 * mid)))
            area = (d_m ** 2 / 8.0) * (theta - math.sin(theta))
            q_calc = area * v

            if q_calc < q_design_m3s:
                lo = mid
            else:
                hi = mid
                best_yd = mid
                best_v = v
                best_tau = tractive_stress(rh, slope)

        if best_yd is None:
            # This diameter is too small even at max fill
            continue

        # Check constraints
        if best_tau is not None and best_tau < MIN_TRACTIVE_STRESS:
            continue
        if best_v is not None and best_v > MAX_VELOCITY:
            continue

        return PipeSegment(
            edge_id=edge_id,
            diameter_mm=dn,
            manning_n=n,
            slope=slope,
            cover_depth=cover_depth,
            flow_depth_ratio=best_yd,
            velocity=best_v,
            tractive_stress=best_tau,
            flow_rate=q_design_ls,
            is_pressurized=False,
        )

    # Fallback: largest available diameter
    largest = PIPE_DIAMETERS[-1]
    return PipeSegment(
        edge_id=edge_id,
        diameter_mm=largest,
        manning_n=n,
        slope=slope,
        cover_depth=cover_depth,
        flow_rate=q_design_ls,
        is_pressurized=False,
    )
