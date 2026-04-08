"""Tests for node classification (core/graph/classification.py)."""

import networkx as nx
import pytest

from urbanus_api.core.graph.classification import (
    _cluster_nearby_nodes,
    enforce_direction_changes,
)


class TestClusterNearbyNodes:
    def test_empty_list(self):
        assert _cluster_nearby_nodes([]) == []

    def test_far_apart_no_merge(self):
        """Nodes > 5m apart → no merge."""
        nodes = [
            {"id": "1", "position": {"lat": -23.550, "lng": -46.650}, "degree": 1},
            {"id": "2", "position": {"lat": -23.560, "lng": -46.650}, "degree": 1},
        ]
        result = _cluster_nearby_nodes(nodes, snap_distance=5.0)
        assert len(result) == 2

    def test_close_nodes_merge(self):
        """Nodes < 5m apart → merge into one."""
        nodes = [
            {
                "id": "1",
                "position": {"lat": -23.55000, "lng": -46.65000},
                "degree": 1,
                "connectedStreets": ["s1"],
                "streetNames": ["Rua A"],
                "pvObrigatorio": False,
                "isEndpoint": False,
            },
            {
                "id": "2",
                "position": {"lat": -23.55001, "lng": -46.65001},
                "degree": 2,
                "connectedStreets": ["s2"],
                "streetNames": ["Rua B"],
                "pvObrigatorio": False,
                "isEndpoint": False,
            },
        ]
        result = _cluster_nearby_nodes(nodes, snap_distance=5.0)
        assert len(result) == 1

    def test_merge_inherits_pv_obrigatorio(self):
        """If any node in cluster has pvObrigatorio, merged node has it too."""
        nodes = [
            {
                "id": "1",
                "position": {"lat": -23.55000, "lng": -46.65000},
                "degree": 1,
                "connectedStreets": ["s1"],
                "streetNames": [],
                "pvObrigatorio": True,
                "nodeType": "MANDATORY",
                "accessoryType": "PV",
                "isEndpoint": False,
            },
            {
                "id": "2",
                "position": {"lat": -23.55001, "lng": -46.65001},
                "degree": 1,
                "connectedStreets": ["s2"],
                "streetNames": [],
                "pvObrigatorio": False,
                "isEndpoint": False,
            },
        ]
        result = _cluster_nearby_nodes(nodes, snap_distance=5.0)
        assert len(result) == 1
        assert result[0]["pvObrigatorio"] is True

    def test_merge_picks_highest_degree_representative(self):
        """Representative is the node with highest original degree."""
        nodes = [
            {
                "id": "1",
                "position": {"lat": -23.55000, "lng": -46.65000},
                "degree": 1,
                "connectedStreets": ["s1"],
                "streetNames": [],
                "pvObrigatorio": False,
                "isEndpoint": False,
            },
            {
                "id": "2",
                "position": {"lat": -23.55001, "lng": -46.65001},
                "degree": 3,
                "connectedStreets": ["s2", "s3", "s4"],
                "streetNames": [],
                "pvObrigatorio": False,
                "isEndpoint": False,
            },
        ]
        result = _cluster_nearby_nodes(nodes, snap_distance=5.0)
        assert len(result) == 1
        # Merged degree recalculated from all street_ids
        assert result[0]["degree"] >= 2

    def test_merge_prefers_nonzero_elevation_over_zero(self):
        """A valid elevation must win over a coincident spurious zero."""
        nodes = [
            {
                "id": "1",
                "position": {"lat": -23.55000, "lng": -46.65000},
                "degree": 1,
                "connectedStreets": ["s1"],
                "streetNames": [],
                "pvObrigatorio": False,
                "isEndpoint": True,
                "elevation": 0.0,
            },
            {
                "id": "2",
                "position": {"lat": -23.55001, "lng": -46.65001},
                "degree": 1,
                "connectedStreets": ["s2"],
                "streetNames": [],
                "pvObrigatorio": False,
                "isEndpoint": True,
                "elevation": 852.0,
            },
        ]

        result = _cluster_nearby_nodes(nodes, snap_distance=5.0)

        assert len(result) == 1
        assert result[0]["elevation"] == pytest.approx(852.0)


class TestEnforceDirectionChanges:
    def test_sharp_bend_marks_mandatory(self):
        """Node with > 45° deflection becomes mandatory."""
        G = nx.Graph()
        G.add_node("A", x=0.0, y=0.0)
        G.add_node("B", x=1.0, y=0.0, pv_obrigatorio=False)
        G.add_node("C", x=1.0, y=1.0)
        G.add_edge("A", "B", length_m=50)
        G.add_edge("B", "C", length_m=50)

        enforce_direction_changes(G)
        # B has 90° angle → 90° deflection > 45° threshold
        assert G.nodes["B"].get("pv_obrigatorio") is True
        assert G.nodes["B"].get("node_type") == "MANDATORY"

    def test_straight_line_unchanged(self):
        """180° angle → 0° deflection → no change."""
        G = nx.Graph()
        G.add_node("A", x=0.0, y=0.0)
        G.add_node("B", x=1.0, y=0.0, pv_obrigatorio=False)
        G.add_node("C", x=2.0, y=0.0)
        G.add_edge("A", "B", length_m=50)
        G.add_edge("B", "C", length_m=50)

        enforce_direction_changes(G)
        assert G.nodes["B"].get("pv_obrigatorio") is not True

    def test_already_mandatory_skipped(self):
        """Nodes already marked pv_obrigatorio are skipped."""
        G = nx.Graph()
        G.add_node("A", x=0.0, y=0.0)
        G.add_node("B", x=1.0, y=0.0, pv_obrigatorio=True)
        G.add_node("C", x=1.0, y=1.0)
        G.add_edge("A", "B", length_m=50)
        G.add_edge("B", "C", length_m=50)

        enforce_direction_changes(G)
        # Should remain True (unchanged)
        assert G.nodes["B"]["pv_obrigatorio"] is True
