// QC2-C: hero-ring fraction/completion logic (the animation target the
// entrance sweep drives toward on goal-detail open).
import { ringFraction, isRingComplete } from '../../lib/goalRingProgress';

describe('ringFraction', () => {
  it('returns the plain fraction mid-goal', () => {
    expect(ringFraction(3, 12)).toBeCloseTo(0.25);
  });

  it('clamps over-progress to 1 (logging is never capped by targets)', () => {
    expect(ringFraction(20, 12)).toBe(1);
  });

  it('clamps negative progress to 0', () => {
    expect(ringFraction(-2, 12)).toBe(0);
  });

  it('guards a zero threshold (no marks yet) with 0, not NaN', () => {
    expect(ringFraction(0, 0)).toBe(0);
    expect(ringFraction(5, 0)).toBe(0);
  });

  it('guards a negative threshold', () => {
    expect(ringFraction(5, -3)).toBe(0);
  });

  it('is exactly 1 at the threshold', () => {
    expect(ringFraction(12, 12)).toBe(1);
  });
});

describe('isRingComplete', () => {
  it('is false mid-goal', () => {
    expect(isRingComplete(3, 12)).toBe(false);
  });

  it('is true at and past the threshold (ember tint sanctioned)', () => {
    expect(isRingComplete(12, 12)).toBe(true);
    expect(isRingComplete(20, 12)).toBe(true);
  });

  it('never completes on a zero/negative threshold', () => {
    expect(isRingComplete(0, 0)).toBe(false);
    expect(isRingComplete(5, 0)).toBe(false);
    expect(isRingComplete(5, -1)).toBe(false);
  });
});
