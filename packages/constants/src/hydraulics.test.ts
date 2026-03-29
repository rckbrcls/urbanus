/**
 * Regression guards for NBR 9649 constants.
 * These values MUST match py/urbanus-geo/src/urbanus_geo/constants.py.
 */
import { describe, it, expect } from "vitest";
import { HYDRAULICS } from "./hydraulics";

describe("HYDRAULICS constants", () => {
  it("MANNING_N_DEFAULT = 0.013", () => {
    expect(HYDRAULICS.MANNING_N_DEFAULT).toBe(0.013);
  });

  it("MANNING_N_PVC = 0.010", () => {
    expect(HYDRAULICS.MANNING_N_PVC).toBe(0.010);
  });

  it("GAMMA_WATER = 9810", () => {
    expect(HYDRAULICS.GAMMA_WATER).toBe(9810);
  });

  it("MIN_TRACTIVE_STRESS = 1.0", () => {
    expect(HYDRAULICS.MIN_TRACTIVE_STRESS).toBe(1.0);
  });

  it("MIN_TRACTIVE_STRESS_PVC = 0.6", () => {
    expect(HYDRAULICS.MIN_TRACTIVE_STRESS_PVC).toBe(0.6);
  });

  it("MAX_FLOW_DEPTH_RATIO = 0.75", () => {
    expect(HYDRAULICS.MAX_FLOW_DEPTH_RATIO).toBe(0.75);
  });

  it("MAX_VELOCITY = 5.0", () => {
    expect(HYDRAULICS.MAX_VELOCITY).toBe(5.0);
  });

  it("MIN_FLOW_RATE = 1.5", () => {
    expect(HYDRAULICS.MIN_FLOW_RATE).toBe(1.5);
  });

  it("PIPE_DIAMETERS starts at 100", () => {
    expect(HYDRAULICS.PIPE_DIAMETERS[0]).toBe(100);
  });

  it("PIPE_DIAMETERS is sorted", () => {
    const sorted = [...HYDRAULICS.PIPE_DIAMETERS].sort((a, b) => a - b);
    expect(HYDRAULICS.PIPE_DIAMETERS).toEqual(sorted);
  });

  it("MIN_DIAMETER_COLLECTOR = 150", () => {
    expect(HYDRAULICS.MIN_DIAMETER_COLLECTOR).toBe(150);
  });

  it("MIN_COVER_STREET = 0.90", () => {
    expect(HYDRAULICS.MIN_COVER_STREET).toBe(0.90);
  });

  it("MIN_PV_SPACING = 80", () => {
    expect(HYDRAULICS.MIN_PV_SPACING).toBe(80);
  });

  it("MAX_PV_SPACING = 100", () => {
    expect(HYDRAULICS.MAX_PV_SPACING).toBe(100);
  });

  it("PER_CAPITA_CONSUMPTION = 150", () => {
    expect(HYDRAULICS.PER_CAPITA_CONSUMPTION).toBe(150);
  });

  it("RETURN_COEFFICIENT = 0.80", () => {
    expect(HYDRAULICS.RETURN_COEFFICIENT).toBe(0.80);
  });

  it("K1_MAX_DAILY = 1.2", () => {
    expect(HYDRAULICS.K1_MAX_DAILY).toBe(1.2);
  });

  it("K2_MAX_HOURLY = 1.5", () => {
    expect(HYDRAULICS.K2_MAX_HOURLY).toBe(1.5);
  });
});
