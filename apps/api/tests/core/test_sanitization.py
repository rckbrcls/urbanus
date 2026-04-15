"""Tests for graph sanitization (core/graph/sanitization.py)."""

import networkx as nx
import pytest

from urbanus_api.core.graph.sanitization import (
    remove_redundant_nodes,
    detect_grade_breaks,
    enforce_min_pv_spacing,
)


class TestRemoveRedundantNodes:
    def test_removes_close_degree_2_node(self):
        """Degree-2 node with both edges < dist_min → removed."""
        G = nx.Graph()
        G.add_node("A", x=0.0, y=0.0, z=100, pv_obrigatorio=True)
        G.add_node("M", x=0.1, y=0.0, z=99.5, pv_obrigatorio=False)
        G.add_node("B", x=0.2, y=0.0, z=99, pv_obrigatorio=True)
        G.add_edge("A", "M", length_m=10)
        G.add_edge("M", "B", length_m=10)

        G = remove_redundant_nodes(G, dist_min=20, dist_max=100)

        assert "M" not in G
        assert G.has_edge("A", "B")
        assert G.edges["A", "B"]["length_m"] == pytest.approx(20)

    def test_mandatory_node_preserved(self):
        """pv_obrigatorio=True nodes are never removed."""
        G = nx.Graph()
        G.add_node("A", x=0.0, y=0.0, z=100, pv_obrigatorio=True)
        G.add_node("M", x=0.1, y=0.0, z=99.5, pv_obrigatorio=True)
        G.add_node("B", x=0.2, y=0.0, z=99, pv_obrigatorio=True)
        G.add_edge("A", "M", length_m=10)
        G.add_edge("M", "B", length_m=10)

        G = remove_redundant_nodes(G, dist_min=20, dist_max=100)
        assert "M" in G

    def test_far_edges_preserved(self):
        """Edges >= dist_min → node preserved."""
        G = nx.Graph()
        G.add_node("A", x=0.0, y=0.0, z=100, pv_obrigatorio=True)
        G.add_node("M", x=0.5, y=0.0, z=99, pv_obrigatorio=False)
        G.add_node("B", x=1.0, y=0.0, z=98, pv_obrigatorio=True)
        G.add_edge("A", "M", length_m=50)
        G.add_edge("M", "B", length_m=50)

        G = remove_redundant_nodes(G, dist_min=20, dist_max=100)
        assert "M" in G


class TestDetectGradeBreaks:
    def test_slope_change_marks_mandatory(self):
        """Abrupt slope change marks the node as mandatory."""
        G = nx.Graph()
        G.add_node("A", x=0.0, y=0.0, z=100)
        G.add_node("B", x=1.0, y=0.0, z=95, pv_obrigatorio=False)
        G.add_node("C", x=2.0, y=0.0, z=94.5)
        G.add_edge("A", "B", length_m=50)
        G.add_edge("B", "C", length_m=50)
        # slope A→B = 5/50 = 0.10
        # slope B→C = 0.5/50 = 0.01
        # diff = 0.09 > 0.03 threshold

        G = detect_grade_breaks(G)
        assert G.nodes["B"].get("node_type") == "MANDATORY"

    def test_gradual_slope_unchanged(self):
        """Consistent slope → no marking."""
        G = nx.Graph()
        G.add_node("A", x=0.0, y=0.0, z=100)
        G.add_node("B", x=1.0, y=0.0, z=99, pv_obrigatorio=False)
        G.add_node("C", x=2.0, y=0.0, z=98)
        G.add_edge("A", "B", length_m=50)
        G.add_edge("B", "C", length_m=50)
        # slope A→B = 1/50 = 0.02
        # slope B→C = 1/50 = 0.02
        # diff = 0 < 0.03

        G = detect_grade_breaks(G)
        assert G.nodes["B"].get("pv_obrigatorio") is not True




class TestEnforceMinPvSpacing:
    def test_close_pvs_merged(self):
        """Two PVs < 80m apart → one removed."""
        G = nx.Graph()
        G.add_node("A", x=0.0, y=0.0, z=100, pv_obrigatorio=True)
        G.add_node("B", x=0.5, y=0.0, z=99, pv_obrigatorio=True)
        G.add_node("C", x=1.0, y=0.0, z=98, pv_obrigatorio=True)
        G.add_edge("A", "B", length_m=30)
        G.add_edge("B", "C", length_m=100)

        G = enforce_min_pv_spacing(G, min_spacing=80)
        # B has degree 2 and is < 80m from A, should be removed
        assert "B" not in G

    def test_far_pvs_preserved(self):
        """PVs >= 80m apart → no change."""
        G = nx.Graph()
        G.add_node("A", x=0.0, y=0.0, z=100, pv_obrigatorio=True)
        G.add_node("B", x=1.0, y=0.0, z=99, pv_obrigatorio=True)
        G.add_node("C", x=2.0, y=0.0, z=98, pv_obrigatorio=True)
        G.add_edge("A", "B", length_m=90)
        G.add_edge("B", "C", length_m=90)

        G = enforce_min_pv_spacing(G, min_spacing=80)
        assert "B" in G
