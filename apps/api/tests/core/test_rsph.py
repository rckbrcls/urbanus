"""Tests for RSPH sewer routing (core/routing/rsph.py)."""

import networkx as nx
import pytest

from urbanus_api.core.routing.rsph import rsph_sewer_routing
from tests.helpers import make_linear_graph, make_y_graph


class TestRsphRouting:
    def test_linear_downhill_follows_gravity(self):
        """Linear graph with downhill slope → tree follows gravity."""
        G = make_linear_graph(n=5, length_m=50, elevation_start=100, slope=0.02)
        outlet = "N4"  # lowest point
        mandatory = {"N0", "N1", "N2", "N3", "N4"}

        tree, unreachable = rsph_sewer_routing(G, outlet, mandatory)

        assert len(unreachable) == 0
        assert tree.has_node(outlet)
        # All mandatory nodes should be in tree
        for node in mandatory:
            assert tree.has_node(node)

    def test_y_junction_converges(self):
        """Y-graph: both branches converge to outlet."""
        G = make_y_graph()
        outlet = "D"
        mandatory = {"A", "B", "C", "D"}

        tree, unreachable = rsph_sewer_routing(G, outlet, mandatory)

        assert len(unreachable) == 0
        assert tree.has_node("A")
        assert tree.has_node("B")
        assert tree.has_node("D")

    def test_disconnected_node_unreachable(self):
        """Node disconnected from outlet → unreachable."""
        G = make_linear_graph(n=3)
        # Add an isolated node (in graph but no path to outlet)
        G.add_node("ISOLATED", x=-46.70, y=-23.60, z=200, pv_obrigatorio=True)
        outlet = "N2"
        mandatory = {"N0", "N1", "N2", "ISOLATED"}

        tree, unreachable = rsph_sewer_routing(G, outlet, mandatory)

        assert "ISOLATED" in unreachable

    def test_tree_is_digraph(self):
        """Result is a DiGraph (directed)."""
        G = make_linear_graph(n=3)
        tree, _ = rsph_sewer_routing(G, "N2", {"N0", "N1", "N2"})
        assert isinstance(tree, nx.DiGraph)

    def test_outlet_only(self):
        """Only outlet in mandatory → empty tree (just outlet)."""
        G = make_linear_graph(n=3)
        tree, unreachable = rsph_sewer_routing(G, "N2", {"N2"})
        assert len(unreachable) == 0
        assert tree.has_node("N2")
        assert tree.number_of_edges() == 0
