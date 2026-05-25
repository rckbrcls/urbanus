import { describe, expect, it } from 'vitest';

import { formatEdgeLengthLabel, getElevationLabel } from './layers';

describe('map label formatters', () => {
  it('formats edge length labels with a clear prefix and rounded meters', () => {
    expect(formatEdgeLengthLabel(100.4)).toBe('Len 100 m');
    expect(formatEdgeLengthLabel(100.5)).toBe('Len 101 m');
  });

  it('omits edge length labels when length is missing or invalid', () => {
    expect(formatEdgeLengthLabel(null)).toBe('');
    expect(formatEdgeLengthLabel(Number.NaN)).toBe('');
    expect(formatEdgeLengthLabel(0)).toBe('');
  });

  it('formats node elevation labels with a clear prefix and rounded meters', () => {
    expect(getElevationLabel(610.4)).toBe('Elev 610 m');
    expect(getElevationLabel(610.5)).toBe('Elev 611 m');
  });

  it('omits node elevation labels when elevation is missing or invalid', () => {
    expect(getElevationLabel(null)).toBe('');
    expect(getElevationLabel(Number.NaN)).toBe('');
  });
});
