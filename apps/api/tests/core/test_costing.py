"""Tests for network costing (core/hydraulics/costing.py)."""

import networkx as nx
import pytest

from urbanus_api.core.hydraulics.costing import compute_total_cost, PIPE_COST_TABLE
from urbanus_geo.types import PipeSegment, PumpStation
from urbanus_geo.constants import EXCAVATION_A_COEF, EXCAVATION_B_COEF


def _make_pipe(edge_id: str, dn: int = 150) -> PipeSegment:
    return PipeSegment(
        edge_id=edge_id,
        diameter_mm=dn,
        manning_n=0.013,
        slope=0.005,
        cover_depth=0.90,
    )


class TestComputeTotalCost:
    def test_pipe_cost_by_diameter(self):
        """Pipe DN150, 100m → 80 R$/m × 100m = 8000 R$."""
        tree = nx.DiGraph()
        tree.add_node("A")
        tree.add_node("B")
        tree.add_edge("A", "B", length_m=100)

        pipes = [_make_pipe("A->B", dn=150)]
        cost = compute_total_cost(pipes, [], tree)

        # Pipe cost = 80 × 100 = 8000
        # Excavation = (1.0×0.90² + 0.5×0.90) × 100 = (0.81+0.45)×100 = 126
        # Total = 8126
        expected_pipe = PIPE_COST_TABLE[150] * 100
        depth = 0.90
        expected_exc = (EXCAVATION_A_COEF * depth**2 + EXCAVATION_B_COEF * depth) * 100
        expected = expected_pipe + expected_exc
        assert cost == pytest.approx(expected)

    def test_pump_npv_added(self):
        """Pump station NPV added to total."""
        tree = nx.DiGraph()
        tree.add_node("A")
        tree.add_node("B")
        tree.add_edge("A", "B", length_m=100)

        pipes = [_make_pipe("A->B")]
        pump = PumpStation(
            id="pump1",
            node_id="A",
            capacity_ls=5.0,
            head_m=3.0,
            capex=150_000,
            annual_opex=10_000,
            npv=250_000,
        )
        cost_with = compute_total_cost(pipes, [pump], tree)
        cost_without = compute_total_cost(pipes, [], tree)

        assert cost_with == pytest.approx(cost_without + 250_000)

    def test_zero_length_zero_pipe_cost(self):
        """Edge not in tree → 0 length → 0 pipe/excavation cost."""
        tree = nx.DiGraph()
        tree.add_node("A")
        tree.add_node("B")
        # No edge in tree matching pipe

        pipes = [_make_pipe("X->Y")]
        cost = compute_total_cost(pipes, [], tree)
        assert cost == 0.0

    def test_larger_diameter_costs_more(self):
        """DN300 > DN150 per meter."""
        tree = nx.DiGraph()
        tree.add_node("A")
        tree.add_node("B")
        tree.add_edge("A", "B", length_m=100)

        cost_150 = compute_total_cost([_make_pipe("A->B", 150)], [], tree)
        cost_300 = compute_total_cost([_make_pipe("A->B", 300)], [], tree)
        assert cost_300 > cost_150

    def test_multiple_pipes(self):
        """Multiple pipes sum correctly."""
        tree = nx.DiGraph()
        tree.add_node("A")
        tree.add_node("B")
        tree.add_node("C")
        tree.add_edge("A", "B", length_m=50)
        tree.add_edge("B", "C", length_m=50)

        pipes = [_make_pipe("A->B"), _make_pipe("B->C")]
        cost = compute_total_cost(pipes, [], tree)
        assert cost > 0

    def test_pipe_cost_table_regression(self):
        """Ensure cost table has expected values."""
        assert PIPE_COST_TABLE[100] == 60
        assert PIPE_COST_TABLE[150] == 80
        assert PIPE_COST_TABLE[300] == 220
        assert PIPE_COST_TABLE[1000] == 1600
