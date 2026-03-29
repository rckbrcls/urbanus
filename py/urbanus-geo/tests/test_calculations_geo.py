"""Tests for geospatial calculation functions."""

import pytest

from urbanus_geo.calculations import haversine, area_km2, slope_2d, tube_elevation


class TestHaversine:
    def test_same_point_returns_zero(self):
        assert haversine(-23.55, -46.63, -23.55, -46.63) == 0.0

    def test_sao_paulo_to_rio(self):
        """SP (-23.55, -46.63) → RJ (-22.91, -43.17): ~360 km."""
        dist = haversine(-23.55, -46.63, -22.91, -43.17)
        assert 350_000 < dist < 370_000  # meters

    def test_one_degree_at_equator(self):
        """1° latitude at equator ≈ 111.32 km."""
        dist = haversine(0, 0, 1, 0)
        assert 111_000 < dist < 112_000

    def test_symmetry(self):
        d1 = haversine(0, 0, 1, 1)
        d2 = haversine(1, 1, 0, 0)
        assert d1 == pytest.approx(d2)

    def test_short_distance(self):
        """~100m separation."""
        dist = haversine(-23.5500, -46.6300, -23.5509, -46.6300)
        assert 90 < dist < 110

    def test_southern_hemisphere(self):
        """Works correctly with negative latitudes."""
        dist = haversine(-30.0, -50.0, -31.0, -50.0)
        assert 110_000 < dist < 112_000


class TestAreaKm2:
    def test_one_degree_square_at_equator(self):
        """1°×1° at equator ≈ 111.32² ≈ 12,392 km²."""
        area = area_km2(0, 1, 0, 1)
        assert 12_000 < area < 13_000

    def test_zero_area(self):
        """Same bounds → 0."""
        assert area_km2(0, 0, 0, 0) == 0.0

    def test_southern_hemisphere(self):
        """São Paulo area: small box."""
        area = area_km2(-23.56, -23.55, -46.64, -46.63)
        assert area > 0

    def test_higher_latitude_smaller_area(self):
        """Same degree span at 60° should be smaller than at equator."""
        area_equator = area_km2(0, 1, 0, 1)
        area_60 = area_km2(60, 61, 0, 1)
        assert area_60 < area_equator


class TestSlope2d:
    def test_ten_percent(self):
        """10m drop over 100m = 0.10."""
        assert slope_2d(110, 100, 100) == pytest.approx(0.10)

    def test_flat(self):
        """Same elevation = 0."""
        assert slope_2d(100, 100, 50) == 0.0

    def test_zero_distance_returns_zero(self):
        assert slope_2d(110, 100, 0) == 0.0

    def test_uphill(self):
        """z_down > z_up → negative slope."""
        assert slope_2d(100, 110, 100) == pytest.approx(-0.10)

    def test_negative_distance_returns_zero(self):
        assert slope_2d(110, 100, -10) == 0.0


class TestTubeElevation:
    def test_standard(self):
        """100 - 0.90 - 0.15 = 98.95."""
        assert tube_elevation(100, 0.90, 0.15) == pytest.approx(98.95)

    def test_sidewalk_cover(self):
        """100 - 0.65 - 0.15 = 99.20."""
        assert tube_elevation(100, 0.65, 0.15) == pytest.approx(99.20)

    def test_larger_diameter(self):
        """100 - 0.90 - 0.30 = 98.80."""
        assert tube_elevation(100, 0.90, 0.30) == pytest.approx(98.80)
