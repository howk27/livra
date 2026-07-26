import { pickNextMove } from '../../lib/focusQueue';

/**
 * Device report 2026-07-25: a "Fix my sleep" goal made Sleep the FIRST move of
 * the day. Sleep is the last thing anyone can do.
 *
 * The rule already existed — spec 2026-07-11, lib/nextStep.ts: evening marks
 * are not offered before 16:00, daytime marks not after 20:00, and the Sleep
 * library mark has carried `timeAffinity: 'evening'` all along. M8's Next Move
 * card replaced the old hero step and never adopted the gate, which is why
 * selectNextStep ended up referenced by nothing but its own tests.
 */

// 🌙 is the Sleep library mark (timeAffinity: 'evening'); 🏃 is Run (daytime).
const sleep = { id: 'sleep', emoji: '🌙', dailyTarget: 1, weekly_target: 7, frequency_kind: 'fixed' as const };
const walk = { id: 'walk', emoji: '🏃', dailyTarget: 1, weekly_target: 5, frequency_kind: 'variable' as const };
const journal = { id: 'journal', emoji: '📓', dailyTarget: 1, weekly_target: 5, frequency_kind: 'variable' as const };

const noCounts = new Map<string, number>();
const at = (hour: number) => new Date(2026, 6, 25, hour, 0, 0);

describe('pickNextMove time gating', () => {
  it('THE REPORT: sleep does not lead the morning when something else is due', () => {
    // Sleep is FIRST in the user's own mark order — it still must not hero at 9am.
    const hero = pickNextMove([sleep, walk], noCounts, noCounts, null, at(9));
    expect(hero?.id).toBe('walk');
  });

  it('sleep leads in the evening, when it is actually doable', () => {
    const hero = pickNextMove([sleep, walk], noCounts, noCounts, null, at(21));
    expect(hero?.id).toBe('sleep');
  });

  it('a daytime mark stops leading late at night', () => {
    const hero = pickNextMove([walk, journal], noCounts, noCounts, null, at(22));
    expect(hero?.id).toBe('journal');
  });

  it('an out-of-hours mark still heroes when it is the only thing left — never an empty card', () => {
    const hero = pickNextMove([sleep], noCounts, noCounts, null, at(9));
    expect(hero?.id).toBe('sleep');
  });

  it('an explicit tap outranks the clock', () => {
    const hero = pickNextMove([sleep, walk], noCounts, noCounts, 'sleep', at(9));
    expect(hero?.id).toBe('sleep');
  });

  it('without a clock the order is exactly what it was before — no silent re-ordering', () => {
    const hero = pickNextMove([sleep, walk], noCounts, noCounts);
    expect(hero?.id).toBe('sleep');
  });

  it('marks with no emoji are anytime and still lead', () => {
    const custom = { id: 'custom', dailyTarget: 1, weekly_target: 5, frequency_kind: 'variable' as const };
    const hero = pickNextMove([custom, walk], noCounts, noCounts, null, at(9));
    expect(hero?.id).toBe('custom');
  });

  it('still returns null when nothing is due', () => {
    const done = new Map([['walk', 5]]);
    expect(pickNextMove([walk], done, noCounts, null, at(9))).toBeNull();
  });
});

/**
 * MORNING, added 2026-07-25. The founder's call was a soft preference rather
 * than a third window: it may promote a mark, it may never hide one. These
 * tests exist to keep the second half of that sentence true — the failure mode
 * of a "morning" bucket is that it quietly becomes a curfew.
 */
describe('pickNextMove morning preference', () => {
  // 🚿 is the Cold Shower library mark (timeAffinity: 'morning').
  const coldShower = { id: 'cold', emoji: '🚿', dailyTarget: 1, weekly_target: 5, frequency_kind: 'variable' as const };

  it('promotes a morning mark over the user order early in the day', () => {
    const hero = pickNextMove([walk, coldShower], noCounts, noCounts, null, at(8));
    expect(hero?.id).toBe('cold');
  });

  it('gives the order straight back after 11:00', () => {
    const hero = pickNextMove([walk, coldShower], noCounts, noCounts, null, at(11));
    expect(hero?.id).toBe('walk');
  });

  it('NEVER hides the morning mark — mid-afternoon it still heroes when it is the only one due', () => {
    const hero = pickNextMove([coldShower], noCounts, noCounts, null, at(15));
    expect(hero?.id).toBe('cold');
  });

  it('does not promote past an explicit tap', () => {
    const hero = pickNextMove([walk, coldShower], noCounts, noCounts, 'walk', at(8));
    expect(hero?.id).toBe('walk');
  });

  it('carries the daytime ceiling: late at night an evening mark wins instead', () => {
    const hero = pickNextMove([coldShower, journal], noCounts, noCounts, null, at(22));
    expect(hero?.id).toBe('journal');
  });
});
