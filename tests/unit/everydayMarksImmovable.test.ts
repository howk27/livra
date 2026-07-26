/**
 * QC-1058 R3 — "an everyday mark is never scaled by intensity."
 *
 * Water shipped as `variable` with a range of 5/7/7, so the Settings Pace
 * control at "easing" rewrote it to 5 days a week. Founder, on device: "Water
 * should be an everyday thing regardless of the settings or people are going to
 * dehydrate." Hydration is not an intensity dial.
 *
 * Two paths read the same library range and both had to agree, which is why
 * this pins the DATA rather than either function: `frequencyWeeklyTarget` at
 * creation and `paceWeeklyTarget` from Settings. A mark declared everyday must
 * come out at 7 from both, at every intensity, forever.
 */
import { MARK_LIBRARY } from '../../lib/suggestedCounters';
import { frequencyWeeklyTarget, type FrequencyId } from '../../lib/goalMarkSuggestions';
import { paceWeeklyTarget, type PaceLevel } from '../../lib/paceSetting';
import type { Mark } from '../../types';

const ALL_FREQUENCIES: FrequencyId[] = ['light', 'steady', 'pushing'];
const ALL_PACES: PaceLevel[] = ['easing', 'steady', 'push'];

const libraryMark = (id: string) => {
  const m = MARK_LIBRARY.find((x) => x.id === id);
  if (!m) throw new Error(`library mark "${id}" not found`);
  return m;
};

/** The library's own field names, as they are copied onto a real Mark row. */
const asMark = (m: (typeof MARK_LIBRARY)[number]): Mark =>
  ({
    id: m.id,
    name: m.name,
    frequency_kind: m.frequencyKind,
    frequency_min: m.frequency_min,
    frequency_recommended: m.frequency_recommended,
    frequency_max: m.frequency_max,
    weekly_target: m.frequency_recommended,
  }) as Mark;

describe('everyday marks are immovable', () => {
  it('Water asks for 7 at every creation intensity', () => {
    const water = libraryMark('water');
    for (const f of ALL_FREQUENCIES) {
      expect([f, frequencyWeeklyTarget(water, f)]).toEqual([f, 7]);
    }
  });

  it('Pace refuses to touch Water at all', () => {
    const water = asMark(libraryMark('water'));
    for (const p of ALL_PACES) {
      // null is the contract for "this mark is not pace-adjustable" — the
      // Settings loop skips a null and leaves weekly_target alone.
      expect([p, paceWeeklyTarget(water, p)]).toEqual([p, null]);
    }
  });

  it('every non-variable mark carries a range that cannot move', () => {
    // The invariant behind both assertions above: if a kind is exempt from
    // Pace, its min/max must not promise a spread that some other path
    // (frequencyWeeklyTarget) would happily read. Sleep, No Alcohol and now
    // Water all satisfy this; a new fixed mark with a 2/5/7 range would not.
    for (const m of MARK_LIBRARY.filter((x) => x.frequencyKind !== 'variable')) {
      expect([m.id, m.frequency_min, m.frequency_max]).toEqual([
        m.id,
        m.frequency_recommended,
        m.frequency_recommended,
      ]);
    }
  });
});
