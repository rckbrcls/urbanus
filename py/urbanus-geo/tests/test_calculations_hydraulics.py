"""Tests for remaining hydraulic helper calculations."""

import pytest

from urbanus_geo.calculations import min_slope, sewage_flow_estimate, peak_flow


class TestMinSlope:
    def test_nbr_formula(self):
        """I_min = 0.0055 × 1.5^(-0.47)."""
        expected = 0.0055 * (1.5 ** -0.47)
        assert min_slope(1.5) == pytest.approx(expected)

    def test_clamp_below_1_5(self):
        """Flow < 1.5 L/s clamps to 1.5."""
        assert min_slope(0.5) == min_slope(1.5)
        assert min_slope(1.0) == min_slope(1.5)

    def test_inverse_relationship(self):
        """Higher flow → lower minimum slope."""
        assert min_slope(5.0) < min_slope(1.5)
        assert min_slope(20.0) < min_slope(5.0)
class TestSewageFlowEstimate:
    def test_default_params(self):
        """Q = (1000 × 150 × 0.80) / 86400 ≈ 1.389 L/s."""
        q = sewage_flow_estimate(1000)
        expected = (1000 * 150 * 0.80) / 86400
        assert q == pytest.approx(expected)

    def test_zero_population(self):
        assert sewage_flow_estimate(0) == 0.0

    def test_custom_params(self):
        q = sewage_flow_estimate(500, per_capita=200, return_coef=0.70)
        expected = (500 * 200 * 0.70) / 86400
        assert q == pytest.approx(expected)


class TestPeakFlow:
    def test_defaults(self):
        """Q_peak = 1.2 × 1.5 × q_d."""
        q_d = 1.389
        q_peak = peak_flow(q_d)
        assert q_peak == pytest.approx(1.2 * 1.5 * q_d)

    def test_with_infiltration(self):
        q_d = 1.0
        q_peak = peak_flow(q_d, q_inf=0.5)
        assert q_peak == pytest.approx(1.2 * 1.5 * 1.0 + 0.5)

    def test_with_concentrated_flow(self):
        q_d = 1.0
        q_peak = peak_flow(q_d, q_c=2.0)
        assert q_peak == pytest.approx(1.2 * 1.5 * 1.0 + 2.0)
