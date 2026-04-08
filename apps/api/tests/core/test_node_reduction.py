"""Tests for node optimization."""

import networkx as nx

from urbanus_api.core.optimizer.node_reduction import (
    _direction_angle,
    _slope_break,
    _is_through_pipe,
    _merge_close_nodes,
    _merge_edge_pair,
)


class TestDirectionAngle:
    def test_straight_line_zero_deflection(self):
        tree = nx.DiGraph()
        tree.add_node("A", x=0.0, y=0.0)
        tree.add_node("B", x=0.0, y=0.001)
        tree.add_node("C", x=0.0, y=0.002)
        assert _direction_angle(tree, "A", "B", "C") < 5.0

    def test_right_angle_90_deflection(self):
        tree = nx.DiGraph()
        tree.add_node("A", x=0.0, y=0.0)
        tree.add_node("B", x=0.0, y=0.001)
        tree.add_node("C", x=0.001, y=0.001)
        angle = _direction_angle(tree, "A", "B", "C")
        assert 85 < angle < 95

    def test_u_turn_180_deflection(self):
        tree = nx.DiGraph()
        tree.add_node("A", x=0.0, y=0.002)
        tree.add_node("B", x=0.0, y=0.001)
        tree.add_node("C", x=0.0, y=0.002)
        angle = _direction_angle(tree, "A", "B", "C")
        assert angle > 170


class TestSlopeBreak:
    def test_no_break_same_slope(self):
        tree = nx.DiGraph()
        tree.add_node("A", z=10)
        tree.add_node("B", z=9)
        tree.add_node("C", z=8)
        tree.add_edge("A", "B", length_m=50)
        tree.add_edge("B", "C", length_m=50)
        assert _slope_break(tree, "A", "B", "C") < 0.01

    def test_break_different_slopes(self):
        tree = nx.DiGraph()
        tree.add_node("A", z=10)
        tree.add_node("B", z=8)
        tree.add_node("C", z=7.5)
        tree.add_edge("A", "B", length_m=20)
        tree.add_edge("B", "C", length_m=50)
        assert _slope_break(tree, "A", "B", "C") > 0.03


class TestIsThroughPipe:
    def test_straight_through_qualifies(self):
        tree = nx.DiGraph()
        tree.add_node("P", x=0.0, y=0.0, z=10)
        tree.add_node("J", x=0.0, y=0.001, z=9)
        tree.add_node("S", x=0.0, y=0.002, z=8)
        tree.add_edge("P", "J", length_m=40)
        tree.add_edge("J", "S", length_m=40)
        assert _is_through_pipe(tree, "J", "P", "S", max_spacing=100)

    def test_sharp_turn_disqualifies(self):
        tree = nx.DiGraph()
        tree.add_node("P", x=0.0, y=0.0, z=10)
        tree.add_node("J", x=0.0, y=0.001, z=9)
        tree.add_node("S", x=0.001, y=0.0, z=8)
        tree.add_edge("P", "J", length_m=40)
        tree.add_edge("J", "S", length_m=40)
        assert not _is_through_pipe(tree, "J", "P", "S", max_spacing=100)

    def test_too_long_disqualifies(self):
        tree = nx.DiGraph()
        tree.add_node("P", x=0.0, y=0.0, z=10)
        tree.add_node("J", x=0.0, y=0.001, z=9)
        tree.add_node("S", x=0.0, y=0.002, z=8)
        tree.add_edge("P", "J", length_m=60)
        tree.add_edge("J", "S", length_m=60)
        assert not _is_through_pipe(tree, "J", "P", "S", max_spacing=100)


# --- Task 2: Greedy contraction + junction simplification ---

from urbanus_api.core.optimizer.node_reduction import (
    _greedy_contract,
    _simplify_junctions,
)


class TestGreedyContract:
    def test_removes_pass_through_chain(self):
        tree = nx.DiGraph()
        tree.add_node("A", x=0.0, y=0.0, z=10, pv_obrigatorio=True)
        tree.add_node("B", x=0.0, y=0.0003, z=9.5)
        tree.add_node("C", x=0.0, y=0.0006, z=9.0)
        tree.add_node("D", x=0.0, y=0.0009, z=8.5, pv_obrigatorio=True)
        tree.add_edge("A", "B", length_m=30)
        tree.add_edge("B", "C", length_m=30)
        tree.add_edge("C", "D", length_m=30)

        _greedy_contract(tree, max_spacing=100)
        assert "B" not in tree
        assert "C" not in tree
        assert tree.has_edge("A", "D")
        assert tree.edges["A", "D"]["length_m"] == 90

    def test_keeps_mandatory_in_chain(self):
        tree = nx.DiGraph()
        tree.add_node("A", x=0.0, y=0.0, z=10, pv_obrigatorio=True)
        tree.add_node("B", x=0.0, y=0.0003, z=9.5, pv_obrigatorio=True)
        tree.add_node("C", x=0.0, y=0.0006, z=9.0)
        tree.add_node("D", x=0.0, y=0.0009, z=8.5, pv_obrigatorio=True)
        tree.add_edge("A", "B", length_m=30)
        tree.add_edge("B", "C", length_m=30)
        tree.add_edge("C", "D", length_m=30)

        _greedy_contract(tree, max_spacing=100)
        assert "B" in tree
        assert "C" not in tree

    def test_respects_max_spacing(self):
        tree = nx.DiGraph()
        tree.add_node("A", x=0.0, y=0.0, z=10, pv_obrigatorio=True)
        tree.add_node("B", x=0.0, y=0.0005, z=9)
        tree.add_node("C", x=0.0, y=0.001, z=8, pv_obrigatorio=True)
        tree.add_edge("A", "B", length_m=60)
        tree.add_edge("B", "C", length_m=60)

        _greedy_contract(tree, max_spacing=100)
        assert "B" in tree


class TestEdgeGeometrySimplification:
    def test_merge_edge_pair_does_not_promote_removed_node_to_waypoint(self):
        tree = nx.DiGraph()
        tree.add_node("A", x=0.0, y=0.0, z=10)
        tree.add_node("B", x=0.0, y=0.0003, z=9)
        tree.add_node("C", x=0.0, y=0.0006, z=8)
        tree.add_edge("A", "B", length_m=30)
        tree.add_edge("B", "C", length_m=30)

        _merge_edge_pair(tree, "A", "B", "C")

        assert "B" not in tree
        assert tree.has_edge("A", "C")
        assert "waypoints" not in tree.edges["A", "C"]

    def test_simplify_junction_does_not_keep_removed_junction_as_waypoint(self):
        tree = nx.DiGraph()
        tree.add_node("N", x=0.0, y=0.001, z=10)
        tree.add_node("J", x=0.0, y=0.0005, z=9)
        tree.add_node("S", x=0.0, y=0.0, z=8)
        tree.add_node("E", x=0.001, y=0.0005, z=10)
        tree.add_edge("N", "J", length_m=40)
        tree.add_edge("J", "S", length_m=40)
        tree.add_edge("E", "J", length_m=40)

        _simplify_junctions(tree, max_spacing=100)

        assert "J" not in tree
        assert tree.has_edge("N", "S")
        assert "waypoints" not in tree.edges["N", "S"]
        assert tree.has_edge("E", "S")
        assert "waypoints" not in tree.edges["E", "S"]

    def test_merge_close_nodes_does_not_keep_absorbed_node_as_waypoint(self):
        tree = nx.DiGraph()
        tree.add_node("A", x=0.0, y=0.0, z=10)
        tree.add_node("B", x=0.0, y=0.00005, z=9)
        tree.add_node("C", x=0.0, y=0.001, z=8)
        tree.add_edge("A", "B", length_m=5)
        tree.add_edge("B", "C", length_m=90)

        _merge_close_nodes(tree, radius=20.0, outlet="A")

        assert "B" not in tree
        assert tree.has_edge("A", "C")
        assert "waypoints" not in tree.edges["A", "C"]


class TestSimplifyJunctions:
    def test_through_pipe_removes_junction(self):
        tree = nx.DiGraph()
        tree.add_node("N", x=0.0, y=0.001, z=10)
        tree.add_node("J", x=0.0, y=0.0005, z=9)
        tree.add_node("S", x=0.0, y=0.0, z=8)
        tree.add_node("E", x=0.001, y=0.0005, z=10)
        tree.add_edge("N", "J", length_m=40)
        tree.add_edge("J", "S", length_m=40)
        tree.add_edge("E", "J", length_m=40)

        _simplify_junctions(tree, max_spacing=100)
        assert tree.has_edge("N", "S")

    def test_keeps_mandatory_junction(self):
        """Mandatory junction node is never simplified."""
        tree = nx.DiGraph()
        tree.add_node("N", x=0.0, y=0.001, z=10)
        tree.add_node("J", x=0.0, y=0.0005, z=9, pv_obrigatorio=True)
        tree.add_node("S", x=0.0, y=0.0, z=8)
        tree.add_node("E", x=0.001, y=0.0005, z=10)
        tree.add_edge("N", "J", length_m=40)
        tree.add_edge("J", "S", length_m=40)
        tree.add_edge("E", "J", length_m=40)

        _simplify_junctions(tree, max_spacing=100)
        assert "J" in tree


# --- Task 3: Full optimization pipeline ---

from urbanus_api.core.optimizer.node_reduction import (
    optimize_node_placement,
)


class TestOptimizeNodePlacement:
    def test_full_pipeline_reduces_nodes(self):
        """Grid with subdivision nodes: optimization reduces significantly."""
        tree = nx.DiGraph()
        # 4 mandatory corners + 5 intermediate nodes + subdivision mids
        for nid, x, y, z, mand in [
            ("A", 0.0, 0.002, 10, True), ("B", 0.001, 0.002, 9, False),
            ("C", 0.002, 0.002, 8, True),
            ("D", 0.0, 0.001, 9, False), ("E", 0.001, 0.001, 8, False),
            ("F", 0.002, 0.001, 7, False),
            ("G", 0.0, 0.0, 8, True), ("H", 0.001, 0.0, 7, False),
            ("I", 0.002, 0.0, 6, True),
            # Subdivision nodes on long edges
            ("m1", 0.0005, 0.002, 9.5, False),
            ("m2", 0.0005, 0.0, 7.5, False),
        ]:
            tree.add_node(nid, x=x, y=y, z=z, pv_obrigatorio=mand)

        for u, v, length in [
            ("A", "m1", 40), ("m1", "B", 40), ("B", "C", 80),
            ("D", "E", 80), ("E", "F", 80),
            ("G", "m2", 40), ("m2", "H", 40), ("H", "I", 80),
            ("A", "D", 80), ("D", "G", 80),
            ("B", "E", 80), ("E", "H", 80),
            ("C", "F", 80), ("F", "I", 80),
        ]:
            tree.add_edge(u, v, length_m=length)

        before = tree.number_of_nodes()
        optimize_node_placement(tree, max_spacing=100, outlet="I")
        after = tree.number_of_nodes()
        assert after < before
        assert nx.is_directed_acyclic_graph(tree)
        assert "I" in tree
