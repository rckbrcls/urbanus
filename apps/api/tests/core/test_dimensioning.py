"""Tests for hydraulic dimensioning (core/hydraulics/dimensioning.py)."""

import networkx as nx
import pytest

from urbanus_api.core.hydraulics.dimensioning import dimension_network
from urbanus_geo.constants import MIN_DIAMETER_COLLECTOR, MIN_FLOW_RATE
from tests.helpers import make_linear_graph


class TestDimensionNetwork:
    def _make_tree(self, n: int = 3, slope: float = 0.02) -> nx.DiGraph:
        """Create a directed tree from a linear graph."""
        G = make_linear_graph(n=n, length_m=50, elevation_start=100, slope=slope)
        tree = nx.DiGraph()
        for i in range(n):
            nid = f"N{i}"
            tree.add_node(nid, **G.nodes[nid])
        for i in range(n - 1):
            u, v = f"N{i}", f"N{i+1}"
            tree.add_edge(u, v, **G.edges[u, v])
        return tree

    def test_small_pop_gets_dn150(self):
        """Small population → minimum DN 150mm."""
        tree = self._make_tree(n=3)
        pipes = dimension_network(tree, population_per_node=50)

        assert len(pipes) == 2
        for p in pipes:
            assert p.diameter_mm >= MIN_DIAMETER_COLLECTOR

    def test_output_has_correct_count(self):
        """Number of pipes = number of edges in tree."""
        tree = self._make_tree(n=5)
        pipes = dimension_network(tree)
        assert len(pipes) == tree.number_of_edges()

    def test_each_pipe_has_slope(self):
        """Every pipe segment has a positive slope."""
        tree = self._make_tree(n=3)
        pipes = dimension_network(tree)
        for p in pipes:
            assert p.slope > 0

    def test_flow_rate_at_least_minimum(self):
        """Design flow ≥ MIN_FLOW_RATE."""
        tree = self._make_tree(n=3)
        pipes = dimension_network(tree)
        for p in pipes:
            if p.flow_rate is not None:
                assert p.flow_rate >= MIN_FLOW_RATE

    def test_larger_pop_may_need_larger_pipe(self):
        """Higher population → potentially larger diameter."""
        tree_small = self._make_tree(n=3)
        pipes_small = dimension_network(tree_small, population_per_node=10)

        tree_large = self._make_tree(n=3)
        pipes_large = dimension_network(tree_large, population_per_node=5000)

        max_dn_small = max(p.diameter_mm for p in pipes_small)
        max_dn_large = max(p.diameter_mm for p in pipes_large)
        assert max_dn_large >= max_dn_small

    def test_pressurized_edge_skipped(self):
        """Pressurized edges get minimal dimensioning."""
        tree = self._make_tree(n=3)
        # Mark first edge as pressurized
        u, v = list(tree.edges)[0]
        tree.edges[u, v]["is_pressurized"] = True

        pipes = dimension_network(tree)
        pressurized = [p for p in pipes if p.is_pressurized]
        assert len(pressurized) == 1
