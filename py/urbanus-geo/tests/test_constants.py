"""Regression guards for NBR 9649 constants."""

from urbanus_geo.constants import (
    MANNING_N_DEFAULT,
    MANNING_N_PVC,
    GAMMA_WATER,
    MIN_TRACTIVE_STRESS,
    MIN_TRACTIVE_STRESS_PVC,
    MAX_FLOW_DEPTH_RATIO,
    MAX_VELOCITY,
    MIN_FLOW_RATE,
    PIPE_DIAMETERS,
    MIN_DIAMETER_COLLECTOR,
    MIN_DIAMETER_LATERAL,
    MIN_COVER_STREET,
    MIN_COVER_SIDEWALK,
    MAX_PV_SPACING,
    MIN_PV_SPACING,
    SNAP_DISTANCE_METERS,
    LONG_EDGE_MAX_DISTANCE,
    REDUNDANT_NODE_MIN_DISTANCE,
    CURVE_ANGLE_THRESHOLD,
    ELEVATION_PROMINENCE_MIN,
    DIRECTION_CHANGE_THRESHOLD,
    GRADE_BREAK_THRESHOLD,
    MAX_TERRAIN_SLOPE,
    PUMP_PENALTY,
    REUSE_BONUS,
)


class TestHydraulicConstants:
    def test_manning_n_default(self):
        assert MANNING_N_DEFAULT == 0.013

    def test_manning_n_pvc(self):
        assert MANNING_N_PVC == 0.010

    def test_gamma_water(self):
        assert GAMMA_WATER == 9810

    def test_min_tractive_stress(self):
        assert MIN_TRACTIVE_STRESS == 1.0

    def test_min_tractive_stress_pvc(self):
        assert MIN_TRACTIVE_STRESS_PVC == 0.6

    def test_max_flow_depth_ratio(self):
        assert MAX_FLOW_DEPTH_RATIO == 0.75

    def test_max_velocity(self):
        assert MAX_VELOCITY == 5.0

    def test_min_flow_rate(self):
        assert MIN_FLOW_RATE == 1.5


class TestPipeDiameters:
    def test_starts_at_100(self):
        assert PIPE_DIAMETERS[0] == 100

    def test_sorted_ascending(self):
        assert PIPE_DIAMETERS == sorted(PIPE_DIAMETERS)

    def test_contains_standard_sizes(self):
        for dn in [100, 150, 200, 300, 400, 600, 1000]:
            assert dn in PIPE_DIAMETERS

    def test_min_diameter_collector(self):
        assert MIN_DIAMETER_COLLECTOR == 150

    def test_min_diameter_lateral(self):
        assert MIN_DIAMETER_LATERAL == 100


class TestCoverDepths:
    def test_min_cover_street(self):
        assert MIN_COVER_STREET == 0.90

    def test_min_cover_sidewalk(self):
        assert MIN_COVER_SIDEWALK == 0.65

    def test_street_deeper_than_sidewalk(self):
        assert MIN_COVER_STREET > MIN_COVER_SIDEWALK


class TestPVSpacing:
    def test_max_spacing(self):
        assert MAX_PV_SPACING == 100

    def test_min_spacing(self):
        assert MIN_PV_SPACING == 80


class TestPipelineConstants:
    def test_long_edge_max(self):
        assert LONG_EDGE_MAX_DISTANCE == 100.0

    def test_redundant_node_min(self):
        assert REDUNDANT_NODE_MIN_DISTANCE == 20.0

    def test_curve_angle_threshold(self):
        assert CURVE_ANGLE_THRESHOLD == 150.0

    def test_elevation_prominence_min(self):
        assert ELEVATION_PROMINENCE_MIN == 2.0

    def test_direction_change_threshold(self):
        assert DIRECTION_CHANGE_THRESHOLD == 45.0

    def test_grade_break_threshold(self):
        assert GRADE_BREAK_THRESHOLD == 0.03

    def test_max_terrain_slope(self):
        assert MAX_TERRAIN_SLOPE == 0.15

    def test_snap_distance(self):
        assert SNAP_DISTANCE_METERS == 5.0

    def test_pump_penalty(self):
        assert PUMP_PENALTY == 100_000

    def test_reuse_bonus(self):
        assert REUSE_BONUS == 0.5
