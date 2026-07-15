import { meetsGoalTextGate, MIN_GOAL_LENGTH } from '../../lib/ai/goalGeneration';

/**
 * QC3-B: the AI word-gate relaxed from MIN_GOAL_LENGTH 10 → 4 + one real word,
 * so terse-but-real goals ("save 10k", "read") reach the model while empty,
 * whitespace-only, single-character, and all-initials strings still bounce.
 */
describe('meetsGoalTextGate — relaxed AI word-gate (QC3-B)', () => {
  it('passes terse-but-real goals the old 10-char floor blocked', () => {
    expect(meetsGoalTextGate('save 10k')).toBe(true); // 8 chars — was blocked
    expect(meetsGoalTextGate('read')).toBe(true);
    expect(meetsGoalTextGate('learn')).toBe(true);
    expect(meetsGoalTextGate('Run a marathon')).toBe(true);
  });

  it('rejects empty, whitespace-only, and single characters', () => {
    expect(meetsGoalTextGate('')).toBe(false);
    expect(meetsGoalTextGate('   ')).toBe(false);
    expect(meetsGoalTextGate('a')).toBe(false);
  });

  it('rejects an all-single-letter string (length passes, no real word)', () => {
    expect(meetsGoalTextGate('a b c')).toBe(false);
  });

  it('keeps rejecting sub-floor lengths (the 3-char "run" stays too short)', () => {
    expect(MIN_GOAL_LENGTH).toBe(4);
    expect(meetsGoalTextGate('run')).toBe(false);
  });
});
