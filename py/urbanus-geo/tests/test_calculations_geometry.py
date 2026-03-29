"""Tests for geometry functions (angle, intersection)."""

import pytest

from urbanus_geo.calculations import angle_at_node, line_intersection


class TestAngleAtNode:
    def test_straight_line_180(self):
        """A-B-C in a straight line → 180°."""
        a = (0, 0)
        b = (1, 0)
        c = (2, 0)
        assert angle_at_node(a, b, c) == pytest.approx(180.0)

    def test_right_angle(self):
        """L-shape → 90°."""
        a = (0, 0)
        b = (1, 0)
        c = (1, 1)
        assert angle_at_node(a, b, c) == pytest.approx(90.0)

    def test_angle_135(self):
        """135° internal angle (45° deflection)."""
        import math
        a = (0, 0)
        b = (1, 0)
        c = (1 + math.cos(math.radians(45)), math.sin(math.radians(45)))
        angle = angle_at_node(a, b, c)
        assert angle == pytest.approx(135.0, abs=0.01)

    def test_zero_vector_returns_zero(self):
        """Same point A=B → 0."""
        a = (1, 1)
        b = (1, 1)
        c = (2, 2)
        assert angle_at_node(a, b, c) == 0.0

    def test_symmetry(self):
        """angle(A,B,C) == angle(C,B,A)."""
        a = (0, 0)
        b = (1, 0)
        c = (1, 1)
        assert angle_at_node(a, b, c) == pytest.approx(angle_at_node(c, b, a))


class TestLineIntersection:
    def test_perpendicular_lines(self):
        """Horizontal + vertical lines crossing at (1,0)."""
        a, b = (0, 0), (2, 0)
        c, d = (1, -1), (1, 1)
        result = line_intersection(a, b, c, d)
        assert result is not None
        assert result[0] == pytest.approx(1.0)
        assert result[1] == pytest.approx(0.0)

    def test_parallel_lines_return_none(self):
        """Two horizontal lines → no intersection."""
        a, b = (0, 0), (2, 0)
        c, d = (0, 1), (2, 1)
        assert line_intersection(a, b, c, d) is None

    def test_diagonal_intersection(self):
        """Two diagonals crossing at (0.5, 0.5)."""
        a, b = (0, 0), (1, 1)
        c, d = (0, 1), (1, 0)
        result = line_intersection(a, b, c, d)
        assert result is not None
        assert result[0] == pytest.approx(0.5)
        assert result[1] == pytest.approx(0.5)

    def test_coincident_lines_return_none(self):
        """Same line → denom ≈ 0 → None."""
        a, b = (0, 0), (2, 2)
        c, d = (1, 1), (3, 3)
        assert line_intersection(a, b, c, d) is None
