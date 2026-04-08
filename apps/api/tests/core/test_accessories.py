"""Tests for accessory type assignment (core/graph/accessories.py)."""

import networkx as nx

from urbanus_api.core.graph.accessories import assign_accessory_types


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

        tree = assign_accessory_types(tree)
        assert tree.nodes["C"]["accessory_type"] == "PV"

    def test_terminal_node_gets_pv(self):
        """Terminal node is classified as PV."""
        tree = nx.DiGraph()
        tree.add_node("A", x=0.0, y=0.0)
        tree.add_node("B", x=1.0, y=0.0)
        tree.add_edge("A", "B", length_m=50)

        tree = assign_accessory_types(tree)
        assert tree.nodes["A"]["accessory_type"] == "PV"

    def test_straight_run_gets_pv(self):
        """Degree-2 node on a straight run remains PV."""
        tree = nx.DiGraph()
        tree.add_node("A", x=0.0, y=0.0)
        tree.add_node("B", x=1.0, y=0.0)
        tree.add_node("C", x=2.0, y=0.0)
        tree.add_edge("A", "B", length_m=50)
        tree.add_edge("B", "C", length_m=50)

        tree = assign_accessory_types(tree)
        assert tree.nodes["B"]["accessory_type"] == "PV"

    def test_direction_change_gets_pv(self):
        """Degree-2 node with direction change remains PV."""
        tree = nx.DiGraph()
        tree.add_node("A", x=0.0, y=0.0)
        tree.add_node("B", x=1.0, y=0.0)
        tree.add_node("C", x=1.0, y=1.0)
        tree.add_edge("A", "B", length_m=50)
        tree.add_edge("B", "C", length_m=50)

        tree = assign_accessory_types(tree)
        assert tree.nodes["B"]["accessory_type"] == "PV"

    def test_outlet_terminal_gets_pv(self):
        """Outlet terminal node is classified as PV."""
        tree = nx.DiGraph()
        tree.add_node("A", x=0.0, y=0.0)
        tree.add_node("B", x=1.0, y=0.0)
        tree.add_edge("A", "B", length_m=50)

        tree = assign_accessory_types(tree)
        assert tree.nodes["B"]["accessory_type"] == "PV"
