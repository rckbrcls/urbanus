/**
 * NBR 9649 / 14486 hydraulic constants for sewer network design.
 *
 * Mirrors the Python source of truth at py/urbanus-geo/src/urbanus_geo/constants.py.
 * Used for frontend validations and display.
 */
export const HYDRAULICS = {
  MANNING_N_DEFAULT: 0.013,
  MANNING_N_PVC: 0.010,
  GAMMA_WATER: 9810,
  MIN_TRACTIVE_STRESS: 1.0,
  MIN_TRACTIVE_STRESS_PVC: 0.6,
  MAX_FLOW_DEPTH_RATIO: 0.75,
  MAX_VELOCITY: 5.0,
  MIN_FLOW_RATE: 1.5,
  PIPE_DIAMETERS: [100, 150, 200, 250, 300, 400, 500, 600, 800, 1000],
  MIN_DIAMETER_COLLECTOR: 150,
  MIN_DIAMETER_LATERAL: 100,
  MIN_COVER_STREET: 0.90,
  MIN_COVER_SIDEWALK: 0.65,
  MAX_PV_SPACING: 100,
  MIN_PV_SPACING: 80,
  PV_MIN_LID_DIAMETER: 0.60,
  PV_MIN_CHAMBER_SIZE: 0.80,
  PER_CAPITA_CONSUMPTION: 150,
  RETURN_COEFFICIENT: 0.80,
  K1_MAX_DAILY: 1.2,
  K2_MAX_HOURLY: 1.5,
} as const;
