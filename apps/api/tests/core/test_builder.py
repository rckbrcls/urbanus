"""Tests for graph building and elevation reconciliation."""

from __future__ import annotations

import pytest
import networkx as nx

from urbanus_api.core.graph.builder import _get_or_create_node, build_graph_from_geojson


def _find_node_at(G: nx.Graph, lng: float, lat: float) -> str:
    for node_id, data in G.nodes(data=True):
        if data.get("x") == pytest.approx(lng) and data.get("y") == pytest.approx(lat):
            return node_id
    raise AssertionError(f"Node at ({lng}, {lat}) not found")


class TestGetOrCreateNode:
    def test_upgrades_zero_elevation_when_valid_value_arrives(self):
        G = nx.Graph()
        pos_to_id: dict[str, str] = {}

        node_id = _get_or_create_node(
            G, pos_to_id, "-23.55000,-46.65000", -46.65, -23.55, 0.0,
        )
        same_node_id = _get_or_create_node(
            G, pos_to_id, "-23.55000,-46.65000", -46.65, -23.55, 852.0,
        )

        assert same_node_id == node_id
        assert G.nodes[node_id]["z"] == pytest.approx(852.0)


class TestBuildGraphFromGeoJson:
    def test_shared_coordinate_keeps_valid_elevation_independent_of_feature_order(self):
        feature_a = {
            "type": "Feature",
            "properties": {
                "id": "street-a",
                "name": "Street A",
                "highway": "residential",
                "vertex_elevations": [0.0, 846.0],
            },
            "geometry": {
                "type": "LineString",
                "coordinates": [[-46.65, -23.55], [-46.649, -23.55]],
            },
        }
        feature_b = {
            "type": "Feature",
            "properties": {
                "id": "street-b",
                "name": "Street B",
                "highway": "residential",
                "vertex_elevations": [852.0, 840.0],
            },
            "geometry": {
                "type": "LineString",
                "coordinates": [[-46.65, -23.55], [-46.65, -23.549]],
            },
        }

        for ordered_features in ([feature_a, feature_b], [feature_b, feature_a]):
            geojson = {"type": "FeatureCollection", "features": ordered_features}

            G = build_graph_from_geojson(geojson)
            shared_node = _find_node_at(G, -46.65, -23.55)

            assert G.nodes[shared_node]["z"] == pytest.approx(852.0)
