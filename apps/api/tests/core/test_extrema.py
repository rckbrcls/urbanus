"""Tests for elevation extrema detection (core/elevation/extrema.py)."""

import networkx as nx
import pytest

from urbanus_api.core.elevation.extrema import detect_extrema


class TestDetectExtrema:
    def test_local_maximum_marked_amarelo(self):
        """Node higher than all neighbors → AMARELO."""
        G = nx.Graph()
        G.add_node("peak", x=0.0, y=0.0, z=100)
        G.add_node("left", x=-1.0, y=0.0, z=90)
        G.add_node("right", x=1.0, y=0.0, z=90)
        G.add_edge("left", "peak", length_m=50)
        G.add_edge("peak", "right", length_m=50)

        G = detect_extrema(G, epsilon=0.5, min_prominence=2.0)
        assert G.nodes["peak"].get("node_type") == "AMARELO"

    def test_local_minimum_marked_azul_escuro(self):
        """Node lower than all neighbors → AZUL_ESCURO."""
        G = nx.Graph()
        G.add_node("valley", x=0.0, y=0.0, z=80)
        G.add_node("left", x=-1.0, y=0.0, z=90)
        G.add_node("right", x=1.0, y=0.0, z=90)
        G.add_edge("left", "valley", length_m=50)
        G.add_edge("valley", "right", length_m=50)

        G = detect_extrema(G, epsilon=0.5, min_prominence=2.0)
        assert G.nodes["valley"].get("node_type") == "AZUL_ESCURO"

    def test_low_prominence_ignored(self):
        """Node barely higher than neighbors (< min_prominence) → not marked."""
        G = nx.Graph()
        G.add_node("peak", x=0.0, y=0.0, z=100)
        G.add_node("left", x=-1.0, y=0.0, z=99)  # Only 1m lower
        G.add_node("right", x=1.0, y=0.0, z=99)
        G.add_edge("left", "peak", length_m=50)
        G.add_edge("peak", "right", length_m=50)

        G = detect_extrema(G, epsilon=0.5, min_prominence=2.0)
        assert G.nodes["peak"].get("node_type") is None

    def test_mandatory_node_skipped(self):
        """pv_obrigatorio=True → skipped."""
        G = nx.Graph()
        G.add_node("peak", x=0.0, y=0.0, z=100, pv_obrigatorio=True)
        G.add_node("left", x=-1.0, y=0.0, z=80)
        G.add_node("right", x=1.0, y=0.0, z=80)
        G.add_edge("left", "peak", length_m=50)
        G.add_edge("peak", "right", length_m=50)

        G = detect_extrema(G, epsilon=0.5, min_prominence=2.0)
        assert G.nodes["peak"].get("node_type") is None

    def test_no_elevation_skipped(self):
        """Node without z → skipped."""
        G = nx.Graph()
        G.add_node("peak", x=0.0, y=0.0)  # no z
        G.add_node("left", x=-1.0, y=0.0, z=80)
        G.add_edge("left", "peak", length_m=50)

        G = detect_extrema(G)
        assert G.nodes["peak"].get("node_type") is None

    def test_isolated_node_skipped(self):
        """Node with no neighbors → skipped."""
        G = nx.Graph()
        G.add_node("alone", x=0.0, y=0.0, z=100)

        G = detect_extrema(G)
        assert G.nodes["alone"].get("node_type") is None

    def test_monotonic_descent_no_extrema(self):
        """Linear descent A > B > C → no internal extrema."""
        G = nx.Graph()
        G.add_node("A", x=0.0, y=0.0, z=100)
        G.add_node("B", x=1.0, y=0.0, z=90)
        G.add_node("C", x=2.0, y=0.0, z=80)
        G.add_edge("A", "B", length_m=50)
        G.add_edge("B", "C", length_m=50)

        G = detect_extrema(G)
        assert G.nodes["B"].get("node_type") is None
