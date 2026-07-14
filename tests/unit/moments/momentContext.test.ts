import {
  buildMomentContext,
  celebrationThresholdFor,
  deriveAllDoneForDay,
  deriveCushionRemaining,
  deriveFirstName,
  deriveIsNewBest,
  deriveIsSlipping,
  deriveLifetimeLogCount,
  deriveLogsToday,
  deriveRunDays,
  deriveWhy,
  goalAgeDays,
  isFirstWeek,
  weekPositionOf,
  type BuildMomentContextInputs,
  type MomentGoalInput,
} from '../../../lib/moments/context';
import type { MomentumSnapshot } from '../../../lib/goalMomentum';

const TODAY = '2026-07-14'; // a Tuesday

function goal(overrides: Partial<MomentGoalInput> = {}): MomentGoalInput {
  return {
    id: 'g1',
    title: 'Run a marathon',
    description: 'I want to feel strong at 40',
    created_at: '2026-07-10',
    status: 'active',
    ...overrides,
  };
}

function snap(overrides: Partial<MomentumSnapshot> = {}): MomentumSnapshot {
  return { state: 'on_track', days: 3, cushionRemaining: null, slippingMarkId: null, ...overrides };
}

function inputs(overrides: Partial<BuildMomentContextInputs> = {}): BuildMomentContextInputs {
  return {
    goals: [goal()],
    snapshots: { g1: snap() },
    weeklyCounts: {},
    todayCounts: {},
    dueMarkIds: [],
    todayStr: TODAY,
    firstName: 'Dei',
    ...overrides,
  };
}

describe('goalAgeDays', () => {
  it.each([
    ['2026-07-14', 0], // created today
    ['2026-07-13', 1],
    ['2026-07-07', 7],
    ['2026-07-06', 8],
  ])('created %s → %i days old', (created, expected) => {
    expect(goalAgeDays(created, TODAY)).toBe(expected);
  });

  it('clamps future created_at to 0', () => {
    expect(goalAgeDays('2026-07-20', TODAY)).toBe(0);
  });
});

describe('isFirstWeek edges', () => {
  it.each([
    [0, true],
    [1, true],
    [7, true],
    [8, false],
  ])('age %i → %s', (age, expected) => {
    expect(isFirstWeek(age)).toBe(expected);
  });
});

describe('weekPositionOf (Monday start, hardcoded)', () => {
  it.each([
    ['2026-07-13', 0], // Monday
    ['2026-07-14', 1], // Tuesday
    ['2026-07-18', 5], // Saturday
    ['2026-07-19', 6], // Sunday
  ])('%s → position %i', (date, expected) => {
    expect(weekPositionOf(date)).toBe(expected);
  });
});

describe('celebrationThresholdFor', () => {
  it.each([
    [7, 7],
    [14, 14],
    [30, 30],
  ])('run of %i hits threshold %i', (run, expected) => {
    expect(celebrationThresholdFor(run)).toBe(expected);
  });

  it.each([0, 1, 6, 8, 15, 29, 31])('run of %i is not a threshold day', (run) => {
    expect(celebrationThresholdFor(run)).toBeNull();
  });
});

describe('named derivation helpers (direct)', () => {
  it('deriveRunDays: 0 for null or broken snapshot, clamped otherwise', () => {
    expect(deriveRunDays(null)).toBe(0);
    expect(deriveRunDays(snap({ state: 'broken', days: 9 }))).toBe(0);
    expect(deriveRunDays(snap({ days: -2 }))).toBe(0);
    expect(deriveRunDays(snap({ days: 5 }))).toBe(5);
  });

  it('deriveIsSlipping: true only for the slipping snapshot state', () => {
    expect(deriveIsSlipping(null)).toBe(false);
    expect(deriveIsSlipping(snap({ state: 'on_track' }))).toBe(false);
    expect(deriveIsSlipping(snap({ state: 'slipping' }))).toBe(true);
  });

  it('deriveCushionRemaining: null unless slipping; 0 fallback when slipping without a value', () => {
    expect(deriveCushionRemaining(snap({ state: 'on_track' }))).toBeNull();
    expect(deriveCushionRemaining(snap({ state: 'slipping', cushionRemaining: 0.4 }))).toBe(0.4);
    expect(deriveCushionRemaining(snap({ state: 'slipping', cushionRemaining: null }))).toBe(0);
  });

  it('deriveWhy: trims; null for empty, whitespace, or absent', () => {
    expect(deriveWhy(' feel strong ')).toBe('feel strong');
    expect(deriveWhy('   ')).toBeNull();
    expect(deriveWhy(null)).toBeNull();
    expect(deriveWhy(undefined)).toBeNull();
  });

  it('deriveIsNewBest: only when the run strictly exceeds a recorded best of at least the floor', () => {
    expect(deriveIsNewBest(10, 9)).toBe(true);
    expect(deriveIsNewBest(10, 10)).toBe(false);
    expect(deriveIsNewBest(10, null)).toBe(false);
    expect(deriveIsNewBest(10, 0)).toBe(false);
  });

  it('deriveIsNewBest floor (PL-2): bests under 7 days never fire a record', () => {
    expect(deriveIsNewBest(2, 1)).toBe(false); // day-2 "record" in week one
    expect(deriveIsNewBest(6, 5)).toBe(false);
    expect(deriveIsNewBest(8, 6)).toBe(false); // best below floor even if run is past it
    expect(deriveIsNewBest(8, 7)).toBe(true); // floor exactly met
  });

  it('deriveLogsToday: sums counts, ignoring negatives', () => {
    expect(deriveLogsToday({})).toBe(0);
    expect(deriveLogsToday({ m1: 2, m2: 1, m3: -4 })).toBe(3);
  });

  it('deriveAllDoneForDay: all due marks logged; false when nothing due', () => {
    expect(deriveAllDoneForDay(['m1', 'm2'], { m1: 1, m2: 2 })).toBe(true);
    expect(deriveAllDoneForDay(['m1', 'm2'], { m1: 1 })).toBe(false);
    expect(deriveAllDoneForDay([], { m1: 1 })).toBe(false);
  });

  it('deriveLifetimeLogCount (PL-3): clamps negatives, null when unknown', () => {
    expect(deriveLifetimeLogCount(3)).toBe(3);
    expect(deriveLifetimeLogCount(0)).toBe(0);
    expect(deriveLifetimeLogCount(-2)).toBe(0);
    expect(deriveLifetimeLogCount(null)).toBeNull();
    expect(deriveLifetimeLogCount(undefined)).toBeNull();
  });

  it('deriveFirstName: trims; null for blank or absent', () => {
    expect(deriveFirstName(' Dei ')).toBe('Dei');
    expect(deriveFirstName('  ')).toBeNull();
    expect(deriveFirstName(undefined)).toBeNull();
  });
});

describe('buildMomentContext', () => {
  it('derives per-goal fields from goal + snapshot', () => {
    const ctx = buildMomentContext(inputs());
    expect(ctx.goals).toHaveLength(1);
    const g = ctx.goals[0]!;
    expect(g.goalId).toBe('g1');
    expect(g.goalTitle).toBe('Run a marathon');
    expect(g.hasWhy).toBe(true);
    expect(g.why).toBe('I want to feel strong at 40');
    expect(g.goalAgeDays).toBe(4);
    expect(g.firstWeek).toBe(true);
    expect(g.momentumRunDays).toBe(3);
    expect(g.isSlipping).toBe(false);
    expect(g.cushionRemaining).toBeNull();
  });

  it('marks isSlipping and exposes cushion when the snapshot is slipping (cushion engaged)', () => {
    const ctx = buildMomentContext(
      inputs({ snapshots: { g1: snap({ state: 'slipping', cushionRemaining: 0.4, slippingMarkId: 'm1' }) } }),
    );
    expect(ctx.goals[0]!.isSlipping).toBe(true);
    expect(ctx.goals[0]!.cushionRemaining).toBe(0.4);
  });

  it('treats a broken snapshot as run 0 and not slipping', () => {
    const ctx = buildMomentContext(inputs({ snapshots: { g1: snap({ state: 'broken', days: 9 }) } }));
    expect(ctx.goals[0]!.momentumRunDays).toBe(0);
    expect(ctx.goals[0]!.isSlipping).toBe(false);
  });

  it('handles a missing snapshot (no logs yet)', () => {
    const ctx = buildMomentContext(inputs({ snapshots: {} }));
    expect(ctx.goals[0]!.momentumRunDays).toBe(0);
    expect(ctx.goals[0]!.isSlipping).toBe(false);
  });

  it('filters out non-active goals', () => {
    const ctx = buildMomentContext(
      inputs({ goals: [goal(), goal({ id: 'g2', status: 'completed' }), goal({ id: 'g3', status: 'paused' })] }),
    );
    expect(ctx.goals.map((g) => g.goalId)).toEqual(['g1']);
  });

  it('hasWhy is false for empty or whitespace descriptions', () => {
    const ctx = buildMomentContext(inputs({ goals: [goal({ description: '   ' })] }));
    expect(ctx.goals[0]!.hasWhy).toBe(false);
    expect(ctx.goals[0]!.why).toBeNull();
  });

  it('personalBestRun is an input; isNewBest only when the run exceeds it', () => {
    const base = inputs({ snapshots: { g1: snap({ days: 10 }) } });
    expect(
      buildMomentContext({ ...base, personalBestRuns: { g1: 9 } }).goals[0]!.isNewBest,
    ).toBe(true);
    expect(
      buildMomentContext({ ...base, personalBestRuns: { g1: 10 } }).goals[0]!.isNewBest,
    ).toBe(false);
    expect(buildMomentContext(base).goals[0]!.isNewBest).toBe(false); // no input → PL-2 wires tracking
    expect(buildMomentContext(base).goals[0]!.personalBestRun).toBeNull();
  });

  it('sums logsToday and derives allDoneForDay from due marks', () => {
    const ctx = buildMomentContext(
      inputs({ todayCounts: { m1: 2, m2: 1 }, dueMarkIds: ['m1', 'm2'] }),
    );
    expect(ctx.logsToday).toBe(3);
    expect(ctx.allDoneForDay).toBe(true);
  });

  it('allDoneForDay is false when a due mark has no log, and when nothing is due', () => {
    expect(
      buildMomentContext(inputs({ todayCounts: { m1: 1 }, dueMarkIds: ['m1', 'm2'] })).allDoneForDay,
    ).toBe(false);
    expect(buildMomentContext(inputs({ dueMarkIds: [] })).allDoneForDay).toBe(false);
  });

  it('carries goalLifetimeLogCounts per goal; null when the caller supplied nothing (PL-3)', () => {
    expect(
      buildMomentContext(inputs({ goalLifetimeLogCounts: { g1: 4 } })).goals[0]!.lifetimeLogCount,
    ).toBe(4);
    expect(buildMomentContext(inputs()).goals[0]!.lifetimeLogCount).toBeNull();
    expect(
      buildMomentContext(inputs({ goalLifetimeLogCounts: { other: 2 } })).goals[0]!.lifetimeLogCount,
    ).toBeNull();
  });

  it('normalizes a blank first name to null', () => {
    expect(buildMomentContext(inputs({ firstName: '  ' })).firstName).toBeNull();
    expect(buildMomentContext(inputs({ firstName: undefined })).firstName).toBeNull();
  });
});
