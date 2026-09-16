// Weekly Story card (spec 2026-09-15 §3): sixteen named weeks, ordered rules,
// first match wins, exhaustive. Names are the founder's to redline; the RULES
// are what this file pins.
import {
  ARCHETYPE_IDS,
  ARCHETYPE_NAME_MAX,
  ARCHETYPE_WORD_MAX,
  archetypeSignalsFrom,
  deriveArchetype,
  type ArchetypeId,
  type ArchetypeSignals,
} from '../../../lib/weeklyReview/archetype';
import type { WeeklyReviewData } from '../../../lib/weeklyReview/derive';

const base: ArchetypeSignals = {
  daysActiveCount: 5,
  prevDaysActiveCount: 4,
  firstWeek: false,
  allMarksMet: false,
  momentumHeld: false,
  maxWeeksIn: 3,
};

const sig = (o: Partial<ArchetypeSignals>): ArchetypeSignals => ({ ...base, ...o });

// One fixture per rule, in table order. Reused by the copy-constraint suite.
const cases: Array<[ArchetypeId, Partial<ArchetypeSignals>]> = [
    ['strong_open', { firstWeek: true, daysActiveCount: 4 }],
    ['first_marks', { firstWeek: true, daysActiveCount: 2 }],
    ['week_one', { firstWeek: true, daysActiveCount: 0 }],
    ['full_send', { daysActiveCount: 7, allMarksMet: true }],
    ['clean_sweep', { daysActiveCount: 7, allMarksMet: false }],
    ['comeback', { daysActiveCount: 5, prevDaysActiveCount: 2 }],
    ['locked_in', { daysActiveCount: 6, prevDaysActiveCount: 5, allMarksMet: true }],
    ['slow_burn', { daysActiveCount: 5, prevDaysActiveCount: 5 }],
    ['back_on_it', { daysActiveCount: 3, prevDaysActiveCount: 1 }],
    ['long_game', { daysActiveCount: 4, prevDaysActiveCount: 3, maxWeeksIn: 8 }],
    ['steady_hand', { daysActiveCount: 4, prevDaysActiveCount: 3, momentumHeld: true }],
    ['the_middle', { daysActiveCount: 3, prevDaysActiveCount: 3 }],
    ['breather', { daysActiveCount: 1, prevDaysActiveCount: 5 }],
    ['kept_the_thread', { daysActiveCount: 2, prevDaysActiveCount: 2 }],
    ['rest_week', { daysActiveCount: 0, prevDaysActiveCount: 4 }],
    ['quiet_week', { daysActiveCount: 0, prevDaysActiveCount: 0 }],
];

describe('deriveArchetype: one fixture per rule, in table order', () => {
  it.each(cases)('%s', (id, o) => {
    expect(deriveArchetype(sig(o)).id).toBe(id);
  });

  it('first week beats everything, even a perfect week', () => {
    expect(deriveArchetype(sig({ firstWeek: true, daysActiveCount: 7, allMarksMet: true })).id).toBe(
      'strong_open',
    );
  });

  it('a 7 day week is never The Comeback (rules 4 and 5 come first)', () => {
    expect(deriveArchetype(sig({ daysActiveCount: 7, prevDaysActiveCount: 0 })).id).toBe('clean_sweep');
  });

  it('rule 10 interpolates the week count', () => {
    expect(deriveArchetype(sig({ daysActiveCount: 3, prevDaysActiveCount: 3, maxWeeksIn: 12 })).line).toBe(
      'Week 12. Still here.',
    );
  });
});

describe('deriveArchetype: exhaustive and deterministic', () => {
  it('every signal combination maps to exactly one known id', () => {
    const seen = new Set<ArchetypeId>();
    for (let days = 0; days <= 7; days++)
      for (let prev = 0; prev <= 7; prev++)
        for (const firstWeek of [false, true])
          for (const allMarksMet of [false, true])
            for (const momentumHeld of [false, true])
              for (const maxWeeksIn of [0, 8]) {
                const a = deriveArchetype({
                  daysActiveCount: days,
                  prevDaysActiveCount: prev,
                  firstWeek,
                  allMarksMet,
                  momentumHeld,
                  maxWeeksIn,
                });
                expect(ARCHETYPE_IDS).toContain(a.id);
                seen.add(a.id);
              }
    // Every rule is reachable.
    expect([...seen].sort()).toEqual([...ARCHETYPE_IDS].sort());
  });

  it('is a pure function of its signals', () => {
    const a = deriveArchetype(base);
    const b = deriveArchetype({ ...base });
    expect(a).toEqual(b);
  });
});

describe('archetype copy constraints (spec §3)', () => {
  const all = cases.map(([id, o]) => {
    const a = deriveArchetype(sig(o));
    expect(a.id).toBe(id);
    return a;
  });

  it.each(all.map((a) => [a.id, a] as const))('%s name fits two lines', (_id, a) => {
    expect(a.name.length).toBeLessThanOrEqual(ARCHETYPE_NAME_MAX);
    for (const w of a.name.split(' ')) expect(w.length).toBeLessThanOrEqual(ARCHETYPE_WORD_MAX);
  });

  it.each(all.map((a) => [a.id, a] as const))('%s has no dash in name or line', (_id, a) => {
    expect(a.name).not.toMatch(/[—–-]/);
    expect(a.line).not.toMatch(/[—–]/);
  });
});

describe('archetypeSignalsFrom', () => {
  const review = {
    daysActiveCount: 4,
    prevDaysActiveCount: 1,
    firstWeek: false,
    momentumHeld: true,
    goals: [
      { goalId: 'g1', title: 'A', weeksIn: 2, marks: [{ markId: 'm1', name: 'x', done: 3, target: 3, met: true }] },
      { goalId: 'g2', title: 'B', weeksIn: 9, marks: [{ markId: 'm2', name: 'y', done: 1, target: 3, met: false }] },
    ],
  } as unknown as WeeklyReviewData;

  it('reads the review fields and folds marks and weeks', () => {
    expect(archetypeSignalsFrom(review)).toEqual({
      daysActiveCount: 4,
      prevDaysActiveCount: 1,
      firstWeek: false,
      allMarksMet: false,
      momentumHeld: true,
      maxWeeksIn: 9,
    });
  });

  it('allMarksMet is false with no marks at all, maxWeeksIn is 0 with no goals', () => {
    const empty = { ...review, goals: [] } as unknown as WeeklyReviewData;
    expect(archetypeSignalsFrom(empty)).toMatchObject({ allMarksMet: false, maxWeeksIn: 0 });
  });
});
