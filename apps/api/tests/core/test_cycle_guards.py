"""Tests for cycle prevention in low_points and coverage."""

import networkx as nx
import pytest

from urbanus_api.core.graph.coverage import ensure_full_coverage, _would_create_cycle
from urbanus_api.core.hydraulics.dimensioning import dimension_network


class TestWouldCreateCycle:
    def test_no_cycle_on_new_node(self):
        tree = nx.DiGraph()
        tree.add_edge("A", "B")
        assert not _would_create_cycle(tree, "C", "B")

    def test_detects_direct_back_edge(self):
        tree = nx.DiGraph()
        tree.add_edge("A", "B")
        assert _would_create_cycle(tree, "B", "A")

    def test_detects_indirect_cycle(self):
        tree = nx.DiGraph()
        tree.add_edge("A", "B")
        tree.add_edge("B", "C")
        assert _would_create_cycle(tree, "C", "A")

    def test_self_loop(self):
        tree = nx.DiGraph()
        tree.add_node("A")
        assert _would_create_cycle(tree, "A", "A")

    def test_no_false_positive(self):
        tree = nx.DiGraph()
        tree.add_edge("A", "B")
        tree.add_edge("A", "C")
        # B→C does NOT create a cycle (no path from C back to B)
        assert not _would_create_cycle(tree, "B", "C")


class TestEnsureFullCoverageNoCycles:
    def test_coverage_skips_cycle_inducing_edge(self):
        """Tree A→B→C + undirected C-A edge: should NOT add C→A."""
        tree = nx.DiGraph()
        tree.add_node("A", z=10)
        tree.add_node("B", z=8)
        tree.add_node("C", z=12)
        tree.add_edge("A", "B")
        tree.add_edge("B", "C")  # Uphill in tree (RSPH chose this path)

        G = nx.Graph()
        G.add_node("A", z=10)
        G.add_node("B", z=8)
        G.add_node("C", z=12)
        G.add_edge("A", "B", length_m=50)
        G.add_edge("B", "C", length_m=50)
        G.add_edge("C", "A", length_m=70)  # z_C=12 > z_A=10 → would add C→A → cycle

        ensure_full_coverage(tree, G)
        assert nx.is_directed_acyclic_graph(tree)

    def test_coverage_adds_safe_edges(self):
        """Extra edge D→A should be added (no cycle)."""
        tree = nx.DiGraph()
        tree.add_node("A", z=100)
        tree.add_node("B", z=99)
        tree.add_edge("A", "B")

        G = nx.Graph()
        G.add_node("A", z=100)
        G.add_node("B", z=99)
        G.add_node("D", z=101)
        G.add_edge("A", "B", length_m=50)
        G.add_edge("D", "A", length_m=50)

        ensure_full_coverage(tree, G)
        assert tree.has_edge("D", "A")
        assert nx.is_directed_acyclic_graph(tree)

    def test_grid_topology_no_cycles(self):
        """4-node grid: coverage adds missing edges without creating cycles."""
        tree = nx.DiGraph()
        for nid, z in [("A", 10), ("B", 8), ("C", 6), ("D", 4)]:
            tree.add_node(nid, z=z)
        tree.add_edge("A", "B")
        tree.add_edge("B", "C")
        tree.add_edge("C", "D")

        G = nx.Graph()
        for nid, z in [("A", 10), ("B", 8), ("C", 6), ("D", 4)]:
            G.add_node(nid, z=z)
        G.add_edge("A", "B", length_m=50)
        G.add_edge("B", "C", length_m=50)
        G.add_edge("C", "D", length_m=50)
        G.add_edge("D", "A", length_m=80)  # Would create cycle A→B→C→D→A? No: z_A>z_D → A→D, safe
        G.add_edge("A", "C", length_m=70)  # z_A>z_C → A→C, safe

        ensure_full_coverage(tree, G)
        assert nx.is_directed_acyclic_graph(tree)


class TestReverseDirectionFallback:
    def test_reverse_direction_when_gravity_creates_cycle(self):
        """When gravity direction creates cycle, reverse is used."""
        # Tree has A→B→C (uphill path from RSPH/pump)
        tree = nx.DiGraph()
        tree.add_node("A", z=5)
        tree.add_node("B", z=8)
        tree.add_node("C", z=10)
        tree.add_edge("A", "B", length_m=50)
        tree.add_edge("B", "C", length_m=50)

        G = nx.Graph()
        G.add_node("A", z=5)
        G.add_node("B", z=8)
        G.add_node("C", z=10)
        G.add_edge("A", "B", length_m=50)
        G.add_edge("B", "C", length_m=50)
        G.add_edge("C", "A", length_m=70)  # Gravity: C→A. But C→A→B→C = cycle.

        ensure_full_coverage(tree, G)
        # Reverse direction A→C should be used instead
        assert tree.has_edge("A", "C")
        assert not tree.has_edge("C", "A")
        assert nx.is_directed_acyclic_graph(tree)

    def test_all_edges_covered_in_grid(self):
        """Every G edge is present in the tree (either direction) after coverage."""
        tree = nx.DiGraph()
        for nid, z in [("A", 10), ("B", 8), ("C", 6), ("D", 4)]:
            tree.add_node(nid, z=z)
        tree.add_edge("A", "B", length_m=50)
        tree.add_edge("B", "D", length_m=50)

        G = nx.Graph()
        for nid, z in [("A", 10), ("B", 8), ("C", 6), ("D", 4)]:
            G.add_node(nid, z=z)
        G.add_edge("A", "B", length_m=50)
        G.add_edge("B", "D", length_m=50)
        G.add_edge("A", "C", length_m=50)
        G.add_edge("C", "D", length_m=50)

        ensure_full_coverage(tree, G)
        for u, v in G.edges():
            assert tree.has_edge(u, v) or tree.has_edge(v, u), f"Edge {u}-{v} missing"
        assert nx.is_directed_acyclic_graph(tree)


class TestCoverageWithSanitizedGraph:
    def test_subdivided_edge_not_duplicated(self):
        """Edge A-X-B already in tree: coverage with sanitized G skips it."""
        tree = nx.DiGraph()
        tree.add_node("A", z=100)
        tree.add_node("X", z=99)
        tree.add_node("B", z=98)
        tree.add_edge("A", "X", length_m=25)
        tree.add_edge("X", "B", length_m=25)

        # Sanitized G has the SAME subdivided structure
        G = nx.Graph()
        G.add_node("A", z=100)
        G.add_node("X", z=99)
        G.add_node("B", z=98)
        G.add_edge("A", "X", length_m=25)
        G.add_edge("X", "B", length_m=25)

        ensure_full_coverage(tree, G)
        assert not tree.has_edge("A", "B")  # No shortcut added
        assert tree.number_of_edges() == 2


class TestCoverageRepairAfterCycleBreak:
    def test_broken_edge_repaired(self):
        """Edge removed by _break_cycles is re-added by repair pass."""
        from urbanus_api.main import _break_cycles

        tree = nx.DiGraph()
        for nid, z in [("A", 10), ("B", 8), ("C", 6), ("D", 4)]:
            tree.add_node(nid, z=z)
        tree.add_edge("A", "B", length_m=50)
        tree.add_edge("B", "C", length_m=50)
        tree.add_edge("C", "D", length_m=50)
        tree.add_edge("D", "A", length_m=80)  # Creates cycle

        G = nx.Graph()
        for nid, z in [("A", 10), ("B", 8), ("C", 6), ("D", 4)]:
            G.add_node(nid, z=z)
        G.add_edge("A", "B", length_m=50)
        G.add_edge("B", "C", length_m=50)
        G.add_edge("C", "D", length_m=50)
        G.add_edge("D", "A", length_m=80)

        _break_cycles(tree)
        assert nx.is_directed_acyclic_graph(tree)

        # Repair: re-add missing edges
        ensure_full_coverage(tree, G)
        assert nx.is_directed_acyclic_graph(tree)
        for u, v in G.edges():
            assert tree.has_edge(u, v) or tree.has_edge(v, u), f"Edge {u}-{v} missing"


class TestReducePassThroughNodes:
    def test_removes_simple_pass_through(self):
        """A→B→C with B non-mandatory: B removed, A→C created."""
        from urbanus_api.core.graph.coverage import reduce_pass_through_nodes

        tree = nx.DiGraph()
        tree.add_node("A", z=10, pv_obrigatorio=True)
        tree.add_node("B", z=9)  # NOT mandatory
        tree.add_node("C", z=8, pv_obrigatorio=True)
        tree.add_edge("A", "B", length_m=40)
        tree.add_edge("B", "C", length_m=40)

        reduce_pass_through_nodes(tree, max_edge_length=100)
        assert "B" not in tree
        assert tree.has_edge("A", "C")
        assert tree.edges["A", "C"]["length_m"] == 80

    def test_preserves_mandatory_node(self):
        """A→B→C with B mandatory: B kept."""
        from urbanus_api.core.graph.coverage import reduce_pass_through_nodes

        tree = nx.DiGraph()
        tree.add_node("A", z=10, pv_obrigatorio=True)
        tree.add_node("B", z=9, pv_obrigatorio=True)
        tree.add_node("C", z=8, pv_obrigatorio=True)
        tree.add_edge("A", "B", length_m=40)
        tree.add_edge("B", "C", length_m=40)

        reduce_pass_through_nodes(tree, max_edge_length=100)
        assert "B" in tree

    def test_preserves_junction(self):
        """Node with 2 incoming edges (real junction): not removed."""
        from urbanus_api.core.graph.coverage import reduce_pass_through_nodes

        tree = nx.DiGraph()
        for nid, z in [("A", 10), ("B", 9), ("C", 8), ("D", 7)]:
            tree.add_node(nid, z=z)
        tree.add_edge("A", "C", length_m=40)
        tree.add_edge("B", "C", length_m=40)  # C has 2 incoming
        tree.add_edge("C", "D", length_m=40)

        reduce_pass_through_nodes(tree, max_edge_length=100)
        assert "C" in tree  # Junction preserved

    def test_respects_max_edge_length(self):
        """Merge would exceed max length: node kept."""
        from urbanus_api.core.graph.coverage import reduce_pass_through_nodes

        tree = nx.DiGraph()
        tree.add_node("A", z=10, pv_obrigatorio=True)
        tree.add_node("B", z=9)
        tree.add_node("C", z=8, pv_obrigatorio=True)
        tree.add_edge("A", "B", length_m=60)
        tree.add_edge("B", "C", length_m=60)

        reduce_pass_through_nodes(tree, max_edge_length=100)
        assert "B" in tree  # 60+60=120 > 100 — kept

    def test_chain_reduction(self):
        """A→B→C→D→E with B,C,D non-mandatory: all removed iteratively."""
        from urbanus_api.core.graph.coverage import reduce_pass_through_nodes

        tree = nx.DiGraph()
        tree.add_node("A", z=10, pv_obrigatorio=True)
        tree.add_node("B", z=9)
        tree.add_node("C", z=8)
        tree.add_node("D", z=7)
        tree.add_node("E", z=6, pv_obrigatorio=True)
        tree.add_edge("A", "B", length_m=20)
        tree.add_edge("B", "C", length_m=20)
        tree.add_edge("C", "D", length_m=20)
        tree.add_edge("D", "E", length_m=20)

        reduce_pass_through_nodes(tree, max_edge_length=100)
        assert tree.has_edge("A", "E")
        assert tree.edges["A", "E"]["length_m"] == 80
        assert tree.number_of_nodes() == 2


class TestFullPipelineNoCycles:
    def test_dimension_after_coverage(self):
        """End-to-end: build tree, add coverage, dimension without crash."""
        tree = nx.DiGraph()
        for i, z in enumerate([100, 98, 96, 94]):
            tree.add_node(f"N{i}", x=-46.65 + i * 0.001, y=-23.55, z=z)
        tree.add_edge("N0", "N1", length_m=50)
        tree.add_edge("N1", "N2", length_m=50)
        tree.add_edge("N2", "N3", length_m=50)

        G = nx.Graph()
        for i, z in enumerate([100, 98, 96, 94]):
            G.add_node(f"N{i}", x=-46.65 + i * 0.001, y=-23.55, z=z)
        G.add_edge("N0", "N1", length_m=50)
        G.add_edge("N1", "N2", length_m=50)
        G.add_edge("N2", "N3", length_m=50)
        G.add_edge("N3", "N0", length_m=80)  # Would create cycle

        ensure_full_coverage(tree, G)
        assert nx.is_directed_acyclic_graph(tree)

        # dimension_network must not crash
        pipes = dimension_network(tree)
        assert len(pipes) == tree.number_of_edges()
