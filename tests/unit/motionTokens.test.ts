import { motion, springs } from '../../theme/tokens';

describe('motion tokens', () => {
  it('defines the five duration steps', () => {
    expect(motion).toMatchObject({
      quick: 120, standard: 180, relaxed: 240, gentle: 350, moment: 500,
    });
  });

  it('caps every duration at 500ms (calm guardrail)', () => {
    Object.values(motion).forEach((d) => expect(d).toBeLessThanOrEqual(500));
  });

  it('defines the three spring presets harvested from existing animations', () => {
    expect(springs.playful).toEqual({ damping: 12, stiffness: 280 });
    expect(springs.settle).toEqual({ damping: 20, stiffness: 200 });
    expect(springs.entrance).toEqual({ damping: 14, stiffness: 90 });
  });
});
