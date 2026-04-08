"""Tests for accessory type assignment (core/graph/accessories.py)."""

import networkx as nx
import pytest

from urbanus_api.core.graph.accessories import assign_accessory_types
from urbanus_geo.types import PipeSegment


def _make_pipe(edge_id: str, dn: int = 150) -> PipeSegment:
    return PipeSegment(
        edge_id=edge_id,
        diameter_mm=dn,
        manning_n=0.013,
        slope=0.005,
        cover_depth=0.90,
    )


class TestAssignAccessoryTypes:
    def test_intersection_gets_pv(self):
        """Node with degree ≥ 3 remains PV."""
        tree = nx.DiGraph()
        tree.add_node("A", x=0.0, y=0.0)
        tree.add_node("B", x=1.0, y=0.0)
        tree.add_node("C", x=0.5, y=0.5)
        tree.add_node("D", x=0.5, y=-0.5)
        tree.add_edge("A", "C", length_m=50)
        tree.add_edge("B", "C", length_m=50)
        tree.add_edge("C", "D", length_m=50)

        pipes = [
            _make_pipe("A->C"),
            _make_pipe("B->C"),
            _make_pipe("C->D"),
        ]
        tree = assign_accessory_types(tree, pipes)
        assert tree.nodes["C"]["accessory_type"] == "PV"

    def test_terminal_dn150_gets_pv(self):
        """Terminal node on DN≤150 is still simplified to PV."""
        tree = nx.DiGraph()
        tree.add_node("A", x=0.0, y=0.0)
        tree.add_node("B", x=1.0, y=0.0)
        tree.add_edge("A", "B", length_m=50)

        pipes = [_make_pipe("A->B", dn=150)]
        tree = assign_accessory_types(tree, pipes)
        assert tree.nodes["A"]["accessory_type"] == "PV"

    def test_terminal_large_dn_gets_pv(self):
        """Terminal node on DN > 150 is PV."""
        tree = nx.DiGraph()
        tree.add_node("A", x=0.0, y=0.0)
        tree.add_node("B", x=1.0, y=0.0)
        tree.add_edge("A", "B", length_m=50)

        pipes = [_make_pipe("A->B", dn=300)]
        tree = assign_accessory_types(tree, pipes)
        assert tree.nodes["A"]["accessory_type"] == "PV"

    def test_straight_same_dn_gets_pv(self):
        """Degree-2 node, straight run, same diameter is simplified to PV."""
        tree = nx.DiGraph()
        tree.add_node("A", x=0.0, y=0.0)
        tree.add_node("B", x=1.0, y=0.0)
        tree.add_node("C", x=2.0, y=0.0)
        tree.add_edge("A", "B", length_m=50)
        tree.add_edge("B", "C", length_m=50)

        pipes = [_make_pipe("A->B", dn=150), _make_pipe("B->C", dn=150)]
        tree = assign_accessory_types(tree, pipes)
        assert tree.nodes["B"]["accessory_type"] == "PV"

    def test_direction_change_gets_pv(self):
        """Degree-2 node with direction change remains PV."""
        tree = nx.DiGraph()
        tree.add_node("A", x=0.0, y=0.0)
        tree.add_node("B", x=1.0, y=0.0)
        tree.add_node("C", x=1.0, y=1.0)
        tree.add_edge("A", "B", length_m=50)
        tree.add_edge("B", "C", length_m=50)

        pipes = [_make_pipe("A->B", dn=150), _make_pipe("B->C", dn=150)]
        tree = assign_accessory_types(tree, pipes)
        assert tree.nodes["B"]["accessory_type"] == "PV"

    def test_diameter_change_gets_pv(self):
        """Degree-2 node with diameter change remains PV."""
        tree = nx.DiGraph()
        tree.add_node("A", x=0.0, y=0.0)
        tree.add_node("B", x=1.0, y=0.0)
        tree.add_node("C", x=2.0, y=0.0)
        tree.add_edge("A", "B", length_m=50)
        tree.add_edge("B", "C", length_m=50)

        pipes = [_make_pipe("A->B", dn=150), _make_pipe("B->C", dn=200)]
        tree = assign_accessory_types(tree, pipes)
        assert tree.nodes["B"]["accessory_type"] == "PV"

    def test_outlet_terminal_gets_pv(self):
        """Outlet (last node, degree=1, DN≤150) is simplified to PV."""
        tree = nx.DiGraph()
        tree.add_node("A", x=0.0, y=0.0)
        tree.add_node("B", x=1.0, y=0.0)
        tree.add_edge("A", "B", length_m=50)

        pipes = [_make_pipe("A->B", dn=150)]
        tree = assign_accessory_types(tree, pipes)
        assert tree.nodes["B"]["accessory_type"] == "PV"
