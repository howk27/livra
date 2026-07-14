import { POSTLOG_SPEAK_RATE, selectMoment } from '../../../lib/moments/select';
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
