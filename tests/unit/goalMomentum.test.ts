import {
  expectedInterval,
  atRiskGapFor,
  breakGapFor,
} from '../../lib/goalMomentum';

describe('interval + thresholds', () => {
  it('derives interval = 7 / weekly_target, defaulting to 3', () => {
    expect(expectedInterval(7)).toBeCloseTo(1.0);
    expect(expectedInterval(4)).toBeCloseTo(1.75);
    expect(expectedInterval(2)).toBeCloseTo(3.5);
    expect(expectedInterval(null)).toBeCloseTo(7 / 3);
    expect(expectedInterval(0)).toBeCloseTo(7 / 3);
  });

  it('matches the spec cushion table', () => {
    expect(atRiskGapFor(expectedInterval(7))).toBe(2);
    expect(breakGapFor(expectedInterval(7))).toBe(3);
    expect(atRiskGapFor(expectedInterval(4))).toBe(3);
    expect(breakGapFor(expectedInterval(4))).toBe(5);
    expect(atRiskGapFor(expectedInterval(2))).toBe(5);
    expect(breakGapFor(expectedInterval(2))).toBe(8);
  });
});
