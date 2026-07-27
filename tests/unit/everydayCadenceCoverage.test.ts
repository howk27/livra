import { MARK_LIBRARY, type MarkDefinition } from '../../lib/suggestedCounters';
import { frequencyWeeklyTarget } from '../../lib/goalMarkSuggestions';
import { paceWeeklyTarget } from '../../lib/paceSetting';
import type { FrequencyId } from '../../types';

/**
 * The every-day cadence audit (founder, 2026-07-27: "revise each mark, set the
 * cadence to daily on the ones that make sense").
 *
 * THE RULE: a mark that measures a WHOLE-DAY STATE — you either held the
 * standard today or you did not — is every-day by nature and must never be an
 * intensity dial. A mark that counts a DISCRETE SESSION is legitimately
 * variable. Water was the first case (`59fb080`, "people are going to
 * dehydrate"); Nutrition, Calories, Cut Caffeine and Screen Time carried the
 * identical defect and were found by auditing all 41.
 *
 * ⚠️ THIS IS NOT THE SAME AXIS AS `timeAffinityCoverage.test.ts :: WHOLE_DAY_STATES`,
 * and conflating the two would be a real bug. There, "whole-day state" answers
 * *does this mark have a natural hour* — finance, saving and invest are on that
 * list because reviewing money belongs to no particular time of day. Here the
 * question is *is the standard a daily one*, and reviewing your money every
 * single day is not required of anyone. The lists overlap; they are not equal.
 */

const EVERYDAY = [
  // Held-standard states — you either did or did not, today.
  'sleep', 'water', 'nutrition', 'calories',
  // Ceilings you keep. `fixed`, not `abstinence` — a limit is not going without.
  'no-caffeine', 'screen-time',
  // Going without, which does not rest.
  'no-alcohol', 'no-nicotine', 'no-sugar', 'no-spend',
];

/**
 * State-shaped, and deliberately LEFT variable. Named so the silence is legible
 * — an untagged decision looks identical to a forgotten one, which is exactly
 * how Screen Time sat ambiguous from AUDIT_LOG.md:811 until this pass.
 */
const DELIBERATELY_VARIABLE: Record<string, string> = {
  steps: '"walk 5 days a week" is a real training plan, unlike a calorie range',
  skincare: 'a routine is a personal one; 3 days a week is a legitimate choice',
  finance: 'reviewing your money is a discrete act, not a daily standard',
  saving: 'moving money into savings is an act, not a state you hold',
  invest: 'investing is an act on a schedule, not a daily standard',
};

const find = (id: string): MarkDefinition => {
  const mark = MARK_LIBRARY.find((m) => m.id === id);
  if (!mark) throw new Error(`library mark '${id}' does not exist`);
  return mark;
};

describe('every-day marks are every-day, at every intensity', () => {
  it.each(EVERYDAY)('%s is 7/7/7 and non-variable', (id) => {
    const mark = find(id);
    expect(mark.frequencyKind).not.toBe('variable');
    expect(mark.frequency_min).toBe(7);
    expect(mark.frequency_recommended).toBe(7);
    expect(mark.frequency_max).toBe(7);
  });

  it.each(EVERYDAY)('%s resolves to 7 at light, steady AND pushing', (id) => {
    const mark = find(id);
    for (const frequency of ['light', 'steady', 'pushing'] as FrequencyId[]) {
      expect(frequencyWeeklyTarget(mark, frequency)).toBe(7);
    }
  });

  it.each(EVERYDAY)('the Pace control cannot move %s at all', (id) => {
    const mark = find(id);
    const row = {
      frequency_kind: mark.frequencyKind,
      frequency_min: mark.frequency_min,
      frequency_recommended: mark.frequency_recommended,
      frequency_max: mark.frequency_max,
    };
    expect(paceWeeklyTarget(row, 'easing')).toBeNull();
    expect(paceWeeklyTarget(row, 'steady')).toBeNull();
    expect(paceWeeklyTarget(row, 'push')).toBeNull();
  });
});

describe('the library cannot drift back', () => {
  /**
   * THE SHAPE OF THE ORIGINAL BUG: Water was `variable` with a min of 5, so
   * Pace at "easing" rewrote a 7-day standard to 5. Any non-variable mark
   * carrying a range is that same latent bug waiting for someone to flip its
   * kind back.
   */
  it('no non-variable mark carries a range', () => {
    const ranged = MARK_LIBRARY.filter(
      (m) =>
        m.frequencyKind !== 'variable' &&
        !(m.frequency_min === 7 && m.frequency_recommended === 7 && m.frequency_max === 7),
    );
    expect(ranged.map((m) => `${m.id} ${m.frequency_min}/${m.frequency_recommended}/${m.frequency_max}`)).toEqual([]);
  });

  it('no mark outside the every-day list is non-variable — the list is the whole truth', () => {
    const unlisted = MARK_LIBRARY.filter(
      (m) => m.frequencyKind !== 'variable' && !EVERYDAY.includes(m.id),
    );
    expect(unlisted.map((m) => m.id)).toEqual([]);
  });

  it.each(Object.keys(DELIBERATELY_VARIABLE))(
    '%s stays variable on purpose, not by omission',
    (id) => {
      expect(find(id).frequencyKind).toBe('variable');
    },
  );

  /**
   * The coverage clause: a mark added later must be decided about. It either
   * goes on EVERYDAY, or it is session-shaped and needs no entry — but if it is
   * one of the state-shaped ones we argued over, it belongs on the reasons map
   * so the next reader inherits the argument instead of re-running it.
   */
  it('every every-day id names a real library mark', () => {
    const missing = EVERYDAY.filter((id) => !MARK_LIBRARY.some((m) => m.id === id));
    expect(missing).toEqual([]);
  });

  it('every deliberately-variable id names a real library mark', () => {
    const missing = Object.keys(DELIBERATELY_VARIABLE).filter(
      (id) => !MARK_LIBRARY.some((m) => m.id === id),
    );
    expect(missing).toEqual([]);
  });
});
