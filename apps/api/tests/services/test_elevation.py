"""Tests for elevation enrichment sanitization helpers."""

from __future__ import annotations

import pytest

from urbanus_api.services.elevation import (
    _interpolate_missing_elevations,
    _sanitize_boundary_elevations,
)


class TestBoundaryZeroSanitization:
    def test_bbox_edge_zero_is_replaced_and_interpolated(self):
        coords = [(-46.64, -23.55), (-46.6399, -23.55)]
        elevations = [0.0, 852.0]

        sanitized = _sanitize_boundary_elevations(
            coords,
            elevations,
            south=-23.56,
            north=-23.54,
            west=-46.65,
            east=-46.64,
        )
        repaired = _interpolate_missing_elevations(sanitized)

        assert sanitized[0] is None
        assert repaired[0] == pytest.approx(852.0)
        assert repaired[1] == pytest.approx(852.0)
        assert all(value != 0 for value in repaired if value is not None)

    def test_interior_zero_without_conflicting_context_is_preserved(self):
        coords = [(-46.645, -23.55), (-46.6449, -23.55)]
        elevations = [0.0, 12.0]

        sanitized = _sanitize_boundary_elevations(
            coords,
            elevations,
            south=-23.56,
            north=-23.54,
            west=-46.65,
            east=-46.64,
        )
        repaired = _interpolate_missing_elevations(sanitized)

        assert sanitized[0] == pytest.approx(0.0)
        assert repaired[0] == pytest.approx(0.0)
