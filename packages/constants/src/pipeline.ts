/**
 * Pipeline algorithm constants for sewer graph sanitization.
 *
 * Mirrors the Python source of truth at py/urbanus-geo/src/urbanus_geo/constants.py.
 */
export const PIPELINE = {
  LONG_EDGE_MAX_DISTANCE: 100.0,
  REDUNDANT_NODE_MIN_DISTANCE: 20.0,
  CURVE_ANGLE_THRESHOLD: 150.0,
  ELEVATION_PROMINENCE_MIN: 2.0,
  DIRECTION_CHANGE_THRESHOLD: 45.0,
  MAX_GRAVITY_DEPTH: 4.5,
  PUMP_PENALTY: 100_000,
  REUSE_BONUS: 0.5,
} as const;
