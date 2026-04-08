"""Tests for helper safeguards in main.py."""

from __future__ import annotations

import networkx as nx

from urbanus_api.main import _sanitize_spurious_zero_elevations


class TestSanitizeSpuriousZeroElevations:
    def test_boundary_zero_artifact_cannot_remain_outlet(self):
        G = nx.Graph()
        G.add_node("artifact", x=-46.65, y=-23.55, z=0.0)
        G.add_node("left", x=-46.651, y=-23.55, z=846.0)
        G.add_node("right", x=-46.649, y=-23.55, z=852.0)
        G.add_node("outlet", x=-46.648, y=-23.55, z=840.0)

        G.add_edge("artifact", "left", length_m=50.0)
        G.add_edge("artifact", "right", length_m=50.0)
        G.add_edge("right", "outlet", length_m=50.0)

        _sanitize_spurious_zero_elevations(G)

        assert G.nodes["artifact"]["z"] is None

        outlet = min(
            (node for node, data in G.nodes(data=True) if data.get("z") is not None),
            key=lambda node: G.nodes[node]["z"],
        )
        assert outlet == "outlet"
