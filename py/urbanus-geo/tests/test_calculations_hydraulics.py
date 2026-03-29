"""Tests for hydraulic calculation functions (Manning / NBR 9649)."""

import math

import pytest

from urbanus_geo.calculations import (
    manning_velocity,
    hydraulic_radius_partial,
    tractive_stress,
    min_slope,
    critical_velocity,
    flow_rate,
    sewage_flow_estimate,
    peak_flow,
    pump_npv,
)


class TestManningVelocity:
    def test_typical_values(self):
        """rh=0.05, slope=0.005, n=0.013 → ~0.74 m/s."""
        v = manning_velocity(0.05, 0.005)
        assert 0.70 < v < 0.80

    def test_zero_slope_returns_zero(self):
        assert manning_velocity(0.05, 0) == 0.0

    def test_negative_slope_returns_zero(self):
        assert manning_velocity(0.05, -0.01) == 0.0

    def test_zero_rh_returns_zero(self):
        assert manning_velocity(0, 0.005) == 0.0

    def test_lower_n_gives_higher_velocity(self):
        v_default = manning_velocity(0.05, 0.005, n=0.013)
        v_pvc = manning_velocity(0.05, 0.005, n=0.010)
        assert v_pvc > v_default

    def test_formula_exact(self):
        """V = (1/0.013) × 0.05^(2/3) × 0.005^(1/2)."""
        expected = (1 / 0.013) * (0.05 ** (2.0 / 3.0)) * math.sqrt(0.005)
        assert manning_velocity(0.05, 0.005) == pytest.approx(expected)

    def test_steeper_slope_gives_higher_velocity(self):
        v1 = manning_velocity(0.05, 0.005)
        v2 = manning_velocity(0.05, 0.02)
        assert v2 > v1


class TestHydraulicRadiusPartial:
    def test_half_section(self):
        """At depth=d/2, Rh = d/4 for circular pipe."""
        d = 0.15  # 150mm
        rh = hydraulic_radius_partial(d, d / 2)
        assert rh == pytest.approx(d / 4, rel=0.01)

    def test_zero_depth_returns_zero(self):
        assert hydraulic_radius_partial(0.15, 0) == 0.0

    def test_depth_exceeding_diameter_returns_zero(self):
        assert hydraulic_radius_partial(0.15, 0.20) == 0.0

    def test_zero_diameter_returns_zero(self):
        assert hydraulic_radius_partial(0, 0.05) == 0.0

    def test_small_depth_positive(self):
        rh = hydraulic_radius_partial(0.15, 0.01)
        assert rh > 0

    def test_increasing_depth_increases_rh(self):
        rh_low = hydraulic_radius_partial(0.15, 0.03)
        rh_high = hydraulic_radius_partial(0.15, 0.07)
        assert rh_high > rh_low


class TestTractiveStress:
    def test_direct_multiplication(self):
        """τ = 9810 × 0.05 × 0.005 = 2.4525 Pa."""
        tau = tractive_stress(0.05, 0.005)
        assert tau == pytest.approx(2.4525)

    def test_zero_slope_returns_zero(self):
        assert tractive_stress(0.05, 0) == 0.0

    def test_custom_gamma(self):
        tau = tractive_stress(0.05, 0.005, gamma=10000)
        assert tau == pytest.approx(0.05 * 0.005 * 10000)


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


class TestCriticalVelocity:
    def test_typical_value(self):
        """Vc = 6 × √(9.81 × 0.05) ≈ 4.20 m/s."""
        vc = critical_velocity(0.05)
        expected = 6.0 * math.sqrt(9.81 * 0.05)
        assert vc == pytest.approx(expected)

    def test_zero_rh_returns_zero(self):
        assert critical_velocity(0) == 0.0

    def test_negative_rh_returns_zero(self):
        assert critical_velocity(-0.01) == 0.0


class TestFlowRate:
    def test_multiplication(self):
        """Q = A × V = 0.01 × 2.0 = 0.02 m³/s."""
        assert flow_rate(0.01, 2.0) == pytest.approx(0.02)

    def test_zero_area(self):
        assert flow_rate(0, 5.0) == 0.0

    def test_zero_velocity(self):
        assert flow_rate(0.01, 0) == 0.0


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


class TestPumpNpv:
    def test_zero_opex(self):
        """With no opex, NPV = CAPEX."""
        assert pump_npv(150_000, 0) == pytest.approx(150_000)

    def test_analytical_npv(self):
        """Verify against analytical PV annuity formula."""
        capex = 200_000
        opex = 10_000
        rate = 0.10
        years = 20
        # PV of annuity = opex × ((1-(1+r)^-n) / r)
        pv_annuity = opex * ((1 - (1 + rate) ** -years) / rate)
        expected = capex + pv_annuity
        assert pump_npv(capex, opex, years, rate) == pytest.approx(expected, rel=1e-6)

    def test_one_year(self):
        """NPV for 1 year = CAPEX + OPEX/(1+r)."""
        npv = pump_npv(100_000, 10_000, years=1, rate=0.10)
        expected = 100_000 + 10_000 / 1.10
        assert npv == pytest.approx(expected)

    def test_zero_rate(self):
        """At 0% discount, NPV = CAPEX + years × OPEX."""
        npv = pump_npv(100_000, 10_000, years=5, rate=0.0)
        assert npv == pytest.approx(100_000 + 5 * 10_000)
