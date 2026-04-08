"""Tests for edge routing cost function (core/routing/cost.py)."""

import math

import networkx as nx
import pytest

from urbanus_api.core.routing.cost import edge_cost
from urbanus_geo.constants import REUSE_BONUS


class TestEdgeCost:
    def _simple_graph(self, z_u: float, z_v: float, length: float = 100.0) -> tuple:
        """Helper: two-node graph with given elevations."""
        G = nx.Graph()
        G.add_node("u", z=z_u)
        G.add_node("v", z=z_v)
        data = {"length_m": length}
        G.add_edge("u", "v", **data)
        return G, data

    def test_zero_length_returns_inf(self):
        G, _ = self._simple_graph(100, 95)
        cost = edge_cost("u", "v", {"length_m": 0}, G)
        assert cost == float("inf")

    def test_negative_length_returns_inf(self):
        G, _ = self._simple_graph(100, 95)
        cost = edge_cost("u", "v", {"length_m": -10}, G)
        assert cost == float("inf")

    def test_downhill_finite_cost(self):
        """Good gravity flow → finite cost."""
        G, data = self._simple_graph(100, 95, 100)
        cost = edge_cost("u", "v", data, G)
        assert 0 < cost < float("inf")

    def test_uphill_returns_inf(self):
        """Flow against gravity is not considered a valid route."""
        G, data = self._simple_graph(95, 100, 100)
        cost = edge_cost("u", "v", data, G)
        assert math.isinf(cost)

    def test_low_slope_gets_penalty(self):
        """Slope < 0.005 → slope penalty."""
        G, data = self._simple_graph(100, 99.9, 100)  # slope = 0.001
        cost_low = edge_cost("u", "v", data, G)

        G2, data2 = self._simple_graph(100, 95, 100)  # slope = 0.05
        cost_good = edge_cost("u", "v", data2, G2)

        assert cost_low > cost_good

    def test_reuse_discount(self):
        """Reused edges get REUSE_BONUS discount."""
        G, data = self._simple_graph(100, 95, 100)
        cost_no_reuse = edge_cost("u", "v", data, G)
        cost_reuse = edge_cost("u", "v", data, G, reused_edges={("u", "v")})
        assert cost_reuse < cost_no_reuse
        assert cost_reuse == pytest.approx(cost_no_reuse * REUSE_BONUS)

    def test_no_elevation_moderate_penalty(self):
        """Missing elevation data → moderate slope penalty."""
        G = nx.Graph()
        G.add_node("u", z=None)
        G.add_node("v", z=None)
        data = {"length_m": 100}
        cost = edge_cost("u", "v", data, G)
        assert 0 < cost < float("inf")
