"""Cross-validation values for Python ↔ TypeScript parity.

These exact input/output pairs are mirrored in:
  packages/geo/src/parity.test.ts

Both files MUST produce the same results within 0.5% tolerance.
"""

import pytest

from urbanus_geo.calculations import haversine, area_km2, slope_2d, angle_at_node


# Shared parity test vectors
PARITY_VECTORS = {
    "haversine_sp_rj": {
        "input": (-23.55, -46.63, -22.91, -43.17),
        "expected_range": (358_000, 362_000),
    },
    "haversine_same_point": {
        "input": (-23.55, -46.63, -23.55, -46.63),
        "expected": 0.0,
    },
    "haversine_one_degree_equator": {
        "input": (0, 0, 1, 0),
        "expected_range": (111_190, 111_200),
    },
    "area_equator_1x1": {
        "input": (0, 1, 0, 1),
        "expected_range": (12_300, 12_500),
    },
    "slope_standard": {
        "input": (110, 100, 100),
        "expected": 0.10,
    },
}


class TestParityHaversine:
    def test_sp_to_rj(self):
        args = PARITY_VECTORS["haversine_sp_rj"]["input"]
        lo, hi = PARITY_VECTORS["haversine_sp_rj"]["expected_range"]
        result = haversine(*args)
        assert lo < result < hi

    def test_same_point(self):
        args = PARITY_VECTORS["haversine_same_point"]["input"]
        assert haversine(*args) == PARITY_VECTORS["haversine_same_point"]["expected"]

    def test_one_degree_equator(self):
        args = PARITY_VECTORS["haversine_one_degree_equator"]["input"]
        lo, hi = PARITY_VECTORS["haversine_one_degree_equator"]["expected_range"]
        result = haversine(*args)
        assert lo < result < hi


class TestParityArea:
    def test_equator_1x1(self):
        args = PARITY_VECTORS["area_equator_1x1"]["input"]
        lo, hi = PARITY_VECTORS["area_equator_1x1"]["expected_range"]
        result = area_km2(*args)
        assert lo < result < hi


class TestParitySlope:
    def test_standard(self):
        args = PARITY_VECTORS["slope_standard"]["input"]
        assert slope_2d(*args) == pytest.approx(PARITY_VECTORS["slope_standard"]["expected"])


class TestParityAngle:
    def test_right_angle(self):
        """angle_at_node((0,0), (1,0), (1,1)) → 90°."""
        result = angle_at_node((0, 0), (1, 0), (1, 1))
        assert result == pytest.approx(90.0)

    def test_straight_line(self):
        """angle_at_node((0,0), (1,0), (2,0)) → 180°."""
        result = angle_at_node((0, 0), (1, 0), (2, 0))
        assert result == pytest.approx(180.0)
