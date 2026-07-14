import { buildMomentContext } from '../../../lib/moments/context';
import {
  dayHashRng,
  POSTLOG_SPEAK_RATE,
  previousDayGreetingDefaultId,
  selectMoment,
} from '../../../lib/moments/select';
import type { GoalMomentContext, MomentContext } from '../../../lib/moments/types';

const speak = () => 0; // rng below the gate → postLog speaks; deterministic rotation
const silent = () => 0.9; // rng above the gate → postLog stays quiet

function makeGoal(overrides: Partial<GoalMomentContext> = {}): GoalMomentContext {
  return {
    goalId: 'g1',
    goalTitle: 'Run a marathon',
    why: 'I want to feel strong at 40',
    hasWhy: true,
    goalAgeDays: 20,
    firstWeek: false,
    momentumRunDays: 3,
    isSlipping: false,
    cushionRemaining: null,
    personalBestRun: null,
    isNewBest: false,
    celebrationThreshold: null,
    lifetimeLogCount: null,
    ...overrides,
  };
}

function makeCtx(overrides: Partial<MomentContext> = {}): MomentContext {
  return {
    todayStr: '2026-07-14',
    firstName: 'Dei',
    weekPosition: 1,
    logsToday: 0,
    allDoneForDay: false,
    goals: [],
    weeklyCounts: {},
    todayCounts: {},
    ...overrides,
  };
}

const emptyCtx = makeCtx();

describe('silence defaults (nothing true to say → null)', () => {
  it('momentumBanner returns null on an empty context', () => {
    expect(selectMoment('momentumBanner', emptyCtx, { rng: speak })).toBeNull();
  });

  it('goalDetail returns null on an empty context', () => {
    expect(selectMoment('goalDetail', emptyCtx, { rng: speak, goalId: 'g1' })).toBeNull();
  });

  it('postLog returns null when nothing was logged, even if the gate opens', () => {
    expect(selectMoment('postLog', emptyCtx, { rng: speak })).toBeNull();
  });

  it('greeting falls back to the M6 default rotation (never null)', () => {
    const m = selectMoment('greeting', emptyCtx, { rng: speak });
    expect(m).not.toBeNull();
    expect(m!.type).toBe('greetingDefault');
  });
});

describe('greeting priority matrix', () => {
  type Row = [name: string, goals: GoalMomentContext[], expectedType: string];
  const rows: Row[] = [
    [
      'slipping-direct beats everything',
      [
        makeGoal({ isSlipping: true, cushionRemaining: 0.3 }),
        makeGoal({ goalId: 'g2', goalAgeDays: 0, firstWeek: true, momentumRunDays: 0 }),
        makeGoal({ goalId: 'g3', celebrationThreshold: 7, momentumRunDays: 7 }),
      ],
      'whyResurface',
    ],
    [
      'slipping without a why is skipped; first-week wins',
      [
        makeGoal({ isSlipping: true, hasWhy: false, why: null }),
        makeGoal({ goalId: 'g2', goalAgeDays: 0, firstWeek: true, momentumRunDays: 0 }),
      ],
      'firstWeek',
    ],
    [
      'first-week beats celebration',
      [
        makeGoal({ goalAgeDays: 1, firstWeek: true, momentumRunDays: 0 }),
        makeGoal({ goalId: 'g2', celebrationThreshold: 14, momentumRunDays: 14 }),
      ],
      'firstWeek',
    ],
    [
      'celebration when no slipping or first-week story',
      [makeGoal({ celebrationThreshold: 7, momentumRunDays: 7 })],
      'celebration',
    ],
    [
      'new personal best celebrates',
      [makeGoal({ isNewBest: true, personalBestRun: 9, momentumRunDays: 10 })],
      'celebration',
    ],
    [
      'first-week days 2 to 4 stay silent; falls through to default',
      [makeGoal({ goalAgeDays: 3, firstWeek: true, momentumRunDays: 0 })],
      'greetingDefault',
    ],
    ['no signals → default rotation', [makeGoal()], 'greetingDefault'],
  ];

  it.each(rows)('%s', (_name, goals, expectedType) => {
    const m = selectMoment('greeting', makeCtx({ goals }), { rng: speak });
    expect(m).not.toBeNull();
    expect(m!.type).toBe(expectedType);
    expect(m!.surface).toBe('greeting');
  });

  it('between two week-one goals the younger wins the greeting', () => {
    const goals = [
      makeGoal({ goalId: 'older', goalTitle: 'Older goal', goalAgeDays: 1, firstWeek: true, momentumRunDays: 0 }),
      makeGoal({ goalId: 'younger', goalTitle: 'Younger goal', goalAgeDays: 0, firstWeek: true, momentumRunDays: 0 }),
    ];
    const m = selectMoment('greeting', makeCtx({ goals }), { rng: speak });
    expect(m!.text).toContain('Younger goal');
  });

  it('slipping picks the goal with the worst cushion', () => {
    const goals = [
      makeGoal({ goalId: 'a', goalTitle: 'Goal A', why: 'why A', isSlipping: true, cushionRemaining: 0.8 }),
      makeGoal({ goalId: 'b', goalTitle: 'Goal B', why: 'why B', isSlipping: true, cushionRemaining: 0.1 }),
    ];
    const m = selectMoment('greeting', makeCtx({ goals }), { rng: speak });
    expect(m!.text).toContain('why B');
  });
});

describe('momentumBanner (M3 only)', () => {
  it('speaks the why back when a slipping goal has one', () => {
    const ctx = makeCtx({ goals: [makeGoal({ isSlipping: true })] });
    const m = selectMoment('momentumBanner', ctx, { rng: speak });
    expect(m!.type).toBe('whyResurface');
    expect(m!.text).toContain('I want to feel strong at 40');
  });

  it('returns null when slipping but no why is stored (generic banner copy stays)', () => {
    const ctx = makeCtx({ goals: [makeGoal({ isSlipping: true, hasWhy: false, why: null })] });
    expect(selectMoment('momentumBanner', ctx, { rng: speak })).toBeNull();
  });

  it('returns null when nothing is slipping', () => {
    const ctx = makeCtx({ goals: [makeGoal()] });
    expect(selectMoment('momentumBanner', ctx, { rng: speak })).toBeNull();
  });
});

describe('goalDetail priority matrix', () => {
  type Row = [name: string, g: GoalMomentContext, expected: string | null];
  const rows: Row[] = [
    ['slipping with why → whyResurface', makeGoal({ isSlipping: true }), 'whyResurface'],
    ['celebration threshold', makeGoal({ celebrationThreshold: 30, momentumRunDays: 30 }), 'celebration'],
    ['first week orientation (day 0, no log)', makeGoal({ goalAgeDays: 0, firstWeek: true, momentumRunDays: 0 }), 'firstWeek'],
    ['first week pull (day 6, has logged)', makeGoal({ goalAgeDays: 6, firstWeek: true, momentumRunDays: 2 }), 'firstWeek'],
    ['first week day 3 → silence', makeGoal({ goalAgeDays: 3, firstWeek: true, momentumRunDays: 0 }), null],
    ['nothing true → silence', makeGoal(), null],
  ];

  it.each(rows)('%s', (_name, g, expected) => {
    const m = selectMoment('goalDetail', makeCtx({ goals: [g] }), { rng: speak, goalId: g.goalId });
    if (expected === null) expect(m).toBeNull();
    else expect(m!.type).toBe(expected);
  });

  it('returns null for an unknown or missing goalId', () => {
    const ctx = makeCtx({ goals: [makeGoal({ isSlipping: true })] });
    expect(selectMoment('goalDetail', ctx, { rng: speak, goalId: 'nope' })).toBeNull();
    expect(selectMoment('goalDetail', ctx, { rng: speak })).toBeNull();
  });
});

describe('postLog variable-ratio gate + contextual picks', () => {
  const loggedCtx = (over: Partial<MomentContext> = {}) =>
    makeCtx({ logsToday: 1, goals: [makeGoal()], ...over });

  it('stays silent when rng lands above the speak rate', () => {
    expect(selectMoment('postLog', loggedCtx(), { rng: silent })).toBeNull();
  });

  it('speaks when rng lands below the speak rate', () => {
    const m = selectMoment('postLog', loggedCtx(), { rng: speak });
    expect(m).not.toBeNull();
    expect(m!.type).toBe('postLog');
  });

  it('gate boundary sits at POSTLOG_SPEAK_RATE', () => {
    const justBelow = () => POSTLOG_SPEAK_RATE - 0.001;
    const exactlyAt = () => POSTLOG_SPEAK_RATE;
    expect(selectMoment('postLog', loggedCtx(), { rng: justBelow })).not.toBeNull();
    expect(selectMoment('postLog', loggedCtx(), { rng: exactlyAt })).toBeNull();
  });

  it('log during slipping picks the gentle variant', () => {
    const ctx = loggedCtx({ goals: [makeGoal({ isSlipping: true })] });
    const m = selectMoment('postLog', ctx, { rng: speak, goalId: 'g1' });
    expect(m!.id).toContain('slippingGentle');
  });

  it('closing the day beats first-of-day', () => {
    const ctx = loggedCtx({ logsToday: 1, allDoneForDay: true });
    const m = selectMoment('postLog', ctx, { rng: speak, goalId: 'g1' });
    expect(m!.id).toContain('closesDay');
  });

  it('first log of the day when the day is not closed', () => {
    const m = selectMoment('postLog', loggedCtx({ logsToday: 1 }), { rng: speak, goalId: 'g1' });
    expect(m!.id).toContain('firstOfDay');
  });

  it('plain variety otherwise', () => {
    const m = selectMoment('postLog', loggedCtx({ logsToday: 3 }), { rng: speak, goalId: 'g1' });
    expect(m!.id).toContain('plain');
  });
});

describe('emptyState (M4 invitations)', () => {
  it('defaults to the firstRun variant', () => {
    const m = selectMoment('emptyState', emptyCtx, { rng: speak });
    expect(m!.type).toBe('emptyInvitation');
    expect(m!.id).toContain('firstRun');
  });

  it('returnedEmpty gets its own copy', () => {
    const m = selectMoment('emptyState', emptyCtx, { rng: speak, emptyVariant: 'returnedEmpty' });
    expect(m!.id).toContain('returnedEmpty');
  });
});

describe('M1 first-week day boundaries (PL-3, real derivations end to end)', () => {
  const TODAY = '2026-07-14';

  // created_at → age, run days, lifetime logs, expected greeting story
  type Row = [
    name: string,
    createdAt: string,
    runDays: number,
    lifetimeLogs: number,
    expectedType: string,
    expectedVariant: string | null,
  ];
  const rows: Row[] = [
    ['day 0, never logged → orientation', '2026-07-14', 0, 0, 'firstWeek', 'orientation'],
    ['day 1, never logged → orientation', '2026-07-13', 0, 0, 'firstWeek', 'orientation'],
    ['day 1, already logged → no orientation, default', '2026-07-13', 0, 1, 'greetingDefault', null],
    ['day 5 with a run → pull', '2026-07-09', 2, 3, 'firstWeek', 'pull'],
    ['day 7 with a run → pull (window closes at 7 inclusive)', '2026-07-07', 3, 4, 'firstWeek', 'pull'],
    ['day 8 → out of week one, default', '2026-07-06', 3, 5, 'greetingDefault', null],
    ['day 5 with no log yet → days 2-4 style silence, default', '2026-07-09', 0, 0, 'greetingDefault', null],
  ];

  it.each(rows)('%s', (_name, createdAt, runDays, lifetimeLogs, expectedType, expectedVariant) => {
    const ctx = buildMomentContext({
      goals: [{ id: 'g1', title: 'Read daily', description: null, created_at: createdAt, status: 'active' }],
      snapshots: runDays > 0 ? { g1: { state: 'on_track', days: runDays, cushionRemaining: null, slippingMarkId: null } } : {},
      weeklyCounts: {},
      todayCounts: {},
      dueMarkIds: [],
      todayStr: TODAY,
      firstName: 'Dei',
      goalLifetimeLogCounts: { g1: lifetimeLogs },
    });
    const m = selectMoment('greeting', ctx, { rng: speak })!;
    expect(m.type).toBe(expectedType);
    if (expectedVariant) expect(m.id).toContain(expectedVariant);
  });

  it('orientation falls back to the run-days proxy when lifetime counts are not supplied', () => {
    const g = makeGoal({ goalAgeDays: 1, firstWeek: true, momentumRunDays: 0, lifetimeLogCount: null });
    const m = selectMoment('greeting', makeCtx({ goals: [g] }), { rng: speak })!;
    expect(m.type).toBe('firstWeek');
    expect(m.id).toContain('orientation');
  });
});

describe('M1 first-ever log through the postLog surface (PL-3)', () => {
  const firstLogCtx = (over: Partial<GoalMomentContext> = {}) =>
    makeCtx({
      logsToday: 1,
      goals: [makeGoal({ goalAgeDays: 0, firstWeek: true, momentumRunDays: 1, lifetimeLogCount: 1, ...over })],
    });

  it('acknowledges the first-ever log on a goal', () => {
    const m = selectMoment('postLog', firstLogCtx(), { rng: speak, goalId: 'g1' })!;
    expect(m.type).toBe('firstWeek');
    expect(m.id).toContain('firstLog');
    expect(m.surface).toBe('postLog');
  });

  it('bypasses the variable-ratio gate — a once-ever moment never gambles away', () => {
    const m = selectMoment('postLog', firstLogCtx(), { rng: silent, goalId: 'g1' });
    expect(m).not.toBeNull();
    expect(m!.id).toContain('firstLog');
  });

  it('fires on lifetime count exactly 1; the second log falls through to M5 picks', () => {
    const second = selectMoment('postLog', firstLogCtx({ lifetimeLogCount: 2 }), { rng: speak, goalId: 'g1' })!;
    expect(second.type).toBe('postLog');
    expect(second.id).not.toContain('firstLog');
  });

  it('outranks the slipping-gentle pick (first-ever is rarer)', () => {
    const m = selectMoment('postLog', firstLogCtx({ isSlipping: true, cushionRemaining: 0.5 }), {
      rng: speak,
      goalId: 'g1',
    })!;
    expect(m.id).toContain('firstLog');
  });

  it('needs a goal scope; a goalless log keeps the plain M5 path', () => {
    const ctx = makeCtx({ logsToday: 1, goals: [makeGoal({ lifetimeLogCount: 1 })] });
    const m = selectMoment('postLog', ctx, { rng: speak })!; // no goalId
    expect(m.id).not.toContain('firstLog');
  });
});

describe('M6 default greeting rotation (PL-3)', () => {
  it('fills {name} when present', () => {
    const m = selectMoment('greeting', makeCtx({ firstName: 'Dei' }), { rng: () => 0 })!;
    expect(m.type).toBe('greetingDefault');
    expect(m.text).toContain('Dei');
    expect(m.text).not.toContain('{name}');
  });

  it('reads naturally with no name: slot dropped, first letter re-capitalized', () => {
    const m = selectMoment('greeting', makeCtx({ firstName: null }), { rng: () => 0 })!;
    expect(m.text).not.toContain('{name}');
    expect(m.text).not.toMatch(/^\s*,/);
    expect(m.text.charAt(0)).toBe(m.text.charAt(0).toUpperCase());
  });

  it('rotates through more than one default line across picks', () => {
    const seen = new Set<string>();
    let last: string | undefined;
    for (let i = 0; i < 30; i++) {
      const m = selectMoment('greeting', makeCtx(), {
        rng: Math.random,
        lastMomentIds: last ? { greetingDefault: last } : undefined,
      })!;
      seen.add(m.id);
      last = m.id;
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('dayHashRng (PL-3, day-stable greeting)', () => {
  it('is deterministic for the same seed', () => {
    const a = dayHashRng('2026-07-14');
    const b = dayHashRng('2026-07-14');
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it('varies across seeds (days)', () => {
    expect(dayHashRng('2026-07-14')()).not.toBe(dayHashRng('2026-07-15')());
  });

  it('stays in [0, 1)', () => {
    const rng = dayHashRng('seed');
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('stateless daily greeting rotation (PL-3, the Focus wiring contract)', () => {
  // The exact call focus.tsx makes for a given day.
  const shownOn = (day: string) => {
    const lastId = previousDayGreetingDefaultId(day);
    return selectMoment('greeting', makeCtx(), {
      rng: dayHashRng(day),
      lastMomentIds: lastId ? { greetingDefault: lastId } : undefined,
    })!;
  };

  it('is stable across re-renders within the same day', () => {
    expect(shownOn('2026-07-14').id).toBe(shownOn('2026-07-14').id);
    expect(shownOn('2026-07-14').text).toBe(shownOn('2026-07-14').text);
  });

  it("never repeats the previous day's base pick, across a month of days", () => {
    for (let d = 2; d <= 28; d++) {
      const day = `2026-07-${String(d).padStart(2, '0')}`;
      const yesterdayBase = previousDayGreetingDefaultId(day);
      expect(yesterdayBase).toBeDefined();
      expect(shownOn(day).id).not.toBe(yesterdayBase);
    }
  });

  it("previousDayGreetingDefaultId is yesterday's unexcluded day-seeded pick", () => {
    const base = selectMoment('greeting', makeCtx(), { rng: dayHashRng('2026-07-14') })!;
    expect(previousDayGreetingDefaultId('2026-07-15')).toBe(base.id);
  });
});

describe('rotation anti-repeat through the selector', () => {
  it('never repeats the last greeting default back-to-back', () => {
    const first = selectMoment('greeting', emptyCtx, { rng: speak })!;
    for (let i = 0; i < 20; i++) {
      const next = selectMoment('greeting', emptyCtx, {
        rng: Math.random,
        lastMomentIds: { greetingDefault: first.id },
      })!;
      expect(next.id).not.toBe(first.id);
    }
  });
});
