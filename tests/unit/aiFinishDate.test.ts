/**
 * QC3-C — client-derived projected finish date + gate parity.
 *
 * The model returns an honest `timeframeWeeks`; the CLIENT owns the calendar
 * math (today + weeks*7) so no stale/hallucinated absolute date ever ships.
 * These pin the derivation (goal.target_date) and the review readiness line.
 *
 * Gate-parity block: the edge fn's MIN_GOAL_LENGTH + meetsGoalTextGate mirror
 * lives in supabase/functions/ai-goal-generation/index.ts. The client function
 * is the canonical contract those constants must match; the "save 10k" case is
 * the exact server-parity gap QC3-C closes.
 */
import {
  deriveTargetDate,
  projectedFinishDate,
  buildReadinessLine,
  meetsGoalTextGate,
  MIN_GOAL_LENGTH,
} from '../../lib/ai/goalGeneration';

const JUL_15 = new Date('2026-07-15T12:00:00');

describe('projectedFinishDate / deriveTargetDate', () => {
  it('adds timeframeWeeks * 7 days to the from-date', () => {
    // 2026-07-15 + 12 weeks (84 days) = 2026-10-07
    expect(deriveTargetDate(12, JUL_15)).toBe('2026-10-07');
    // 2026-07-15 + 1 week (7 days) = 2026-07-22
    expect(deriveTargetDate(1, JUL_15)).toBe('2026-07-22');
    // 52-week ceiling still resolves to a real date
    expect(deriveTargetDate(52, JUL_15)).toBe('2027-07-14');
  });

  it('returns a yyyy-MM-dd string for goal.target_date storage', () => {
    expect(deriveTargetDate(8, JUL_15)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('rounds a fractional week count before multiplying', () => {
    // Math.round(2.4)=2 → 14 days
    expect(deriveTargetDate(2.4, JUL_15)).toBe(deriveTargetDate(2, JUL_15));
  });

  it('projectedFinishDate returns a Date the derivation formats', () => {
    const d = projectedFinishDate(12, JUL_15);
    expect(d).toBeInstanceOf(Date);
    expect(d.getFullYear()).toBe(2026);
  });
});

describe('buildReadinessLine', () => {
  it('formats "You\'ll be ready to {goal} by {Mon D, YYYY}."', () => {
    expect(buildReadinessLine('Run a marathon', 12, JUL_15)).toBe(
      "You'll be ready to Run a marathon by Oct 7, 2026.",
    );
  });

  it('trims the goal title', () => {
    expect(buildReadinessLine('  Save $10k  ', 1, JUL_15)).toBe(
      "You'll be ready to Save $10k by Jul 22, 2026.",
    );
  });

  it('uses no dash-as-dash (copy rule)', () => {
    expect(buildReadinessLine('Learn Spanish', 6, JUL_15)).not.toMatch(/ - /);
  });
});

describe('gate parity — the contract the edge fn mirror must match (QC3-C)', () => {
  it('MIN_GOAL_LENGTH is 4 (edge fn lowered 10 → 4 to match)', () => {
    expect(MIN_GOAL_LENGTH).toBe(4);
  });

  it('accepts the terse-but-real goals the old server floor rejected', () => {
    // "save 10k" (8 chars) passed the button but the server used to bounce it.
    expect(meetsGoalTextGate('save 10k')).toBe(true);
    expect(meetsGoalTextGate('read')).toBe(true);
  });

  it('still bounces empty, single-char, and all-initials strings', () => {
    expect(meetsGoalTextGate('')).toBe(false);
    expect(meetsGoalTextGate('a')).toBe(false);
    expect(meetsGoalTextGate('a b c')).toBe(false);
    expect(meetsGoalTextGate('run')).toBe(false); // 3 chars, sub-floor
  });
});
