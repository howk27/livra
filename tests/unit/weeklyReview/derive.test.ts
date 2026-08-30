// WR-1 — lib/weeklyReview/derive.ts (spec 2026-08-29-weekly-review-design.md §4).
// 2026-08-24 is a Monday; the August 2026 dates below lean on that anchor.

import type { MarkEvent } from '../../../types';
import type { MomentumSnapshot } from '../../../lib/goalMomentum';
import {
  countMarksLogged,
  deriveDaysActive,
  deriveFirstWeek,
  deriveMomentumHeld,
  deriveReviewWhy,
  deriveRoomForMore,
  deriveWeeklyReview,
  reviewWeekDates,
  reviewWeekStart,
  selectClosing,
  selectHeadline,
  selectProse,
  type CopyContext,
  type DeriveWeeklyReviewInputs,
  type ReviewGoalCard,
  type ReviewGoalInput,
} from '../../../lib/weeklyReview/derive';

const WEEK = ['2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28', '2026-08-29', '2026-08-30'];

let seq = 0;
function ev(overrides: Partial<MarkEvent> & { occurred_local_date: string }): MarkEvent {
  seq += 1;
  return {
    id: `e${seq}`,
    user_id: 'u1',
    mark_id: 'm1',
    event_type: 'increment',
    amount: 1,
    occurred_at: `${overrides.occurred_local_date}T12:00:00.000Z`,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function goal(overrides: Partial<ReviewGoalInput> & { id: string }): ReviewGoalInput {
  return {
    title: 'Lose 15 pounds',
    description: null,
    created_at: '2026-07-01T00:00:00.000Z',
    status: 'active',
    sort_index: 0,
    ...overrides,
  };
}

const snap = (state: MomentumSnapshot['state']): MomentumSnapshot => ({
  state,
  days: 3,
  cushionRemaining: state === 'slipping' ? 0.5 : null,
  slippingMarkId: null,
});

const baseCtx: CopyContext = {
  firstWeek: false,
  daysActiveCount: 5,
  marksLogged: 12,
  momentumHeld: false,
  hasWhy: false,
  everyMarkMet: false,
  roomForMore: null,
};

describe('review window (Mon–Tue lookback)', () => {
  it('mid-week reviews the current week', () => {
    expect(reviewWeekStart('2026-08-26')).toBe('2026-08-24'); // Wednesday
    expect(reviewWeekStart('2026-08-30')).toBe('2026-08-24'); // Sunday
  });

  it('Monday and Tuesday review the just-closed week', () => {
    expect(reviewWeekStart('2026-08-24')).toBe('2026-08-17'); // Monday
    expect(reviewWeekStart('2026-08-25')).toBe('2026-08-17'); // Tuesday
  });

  it('returns 7 dates Monday first', () => {
    expect(reviewWeekDates('2026-08-26')).toEqual(WEEK);
  });
});

describe('day activity', () => {
  it('maps counted logs onto Mon–Sun positions', () => {
    const events = [
      ev({ occurred_local_date: '2026-08-24' }),
      ev({ occurred_local_date: '2026-08-28' }),
      ev({ occurred_local_date: '2026-08-28' }), // second log same day, still one active day
    ];
    expect(deriveDaysActive(events, WEEK)).toEqual([true, false, false, false, true, false, false]);
  });

  it('ignores soft-deleted and non-increment events', () => {
    const events = [
      ev({ occurred_local_date: '2026-08-24', deleted_at: '2026-08-25T00:00:00.000Z' }),
      ev({ occurred_local_date: '2026-08-25', event_type: 'reset' }),
    ];
    expect(deriveDaysActive(events, WEEK)).toEqual([false, false, false, false, false, false, false]);
    expect(countMarksLogged(events, WEEK)).toBe(0);
  });

  it('counts logs only inside the reviewed week', () => {
    const events = [
      ev({ occurred_local_date: '2026-08-23' }), // Sunday before
      ev({ occurred_local_date: '2026-08-24' }),
      ev({ occurred_local_date: '2026-08-31' }), // Monday after
    ];
    expect(countMarksLogged(events, WEEK)).toBe(1);
  });
});

describe('first week and momentum', () => {
  it('is the first week only while no goal is older than 7 days', () => {
    expect(deriveFirstWeek([goal({ id: 'g1', created_at: '2026-08-25T00:00:00.000Z' })], '2026-08-29')).toBe(true);
    expect(
      deriveFirstWeek(
        [
          goal({ id: 'g1', created_at: '2026-08-25T00:00:00.000Z' }),
          goal({ id: 'g2', created_at: '2026-07-01T00:00:00.000Z' }),
        ],
        '2026-08-29',
      ),
    ).toBe(false);
    expect(deriveFirstWeek([], '2026-08-29')).toBe(false);
  });

  it('momentum holds only when every goal has an unbroken snapshot', () => {
    const goals = [goal({ id: 'g1' }), goal({ id: 'g2' })];
    expect(deriveMomentumHeld(goals, { g1: snap('held'), g2: snap('slipping') })).toBe(true);
    expect(deriveMomentumHeld(goals, { g1: snap('held'), g2: snap('broken') })).toBe(false);
    expect(deriveMomentumHeld(goals, { g1: snap('held') })).toBe(false);
    expect(deriveMomentumHeld([], {})).toBe(false);
  });
});

describe('the why', () => {
  it('takes the first goal in order that has one', () => {
    const goals = [
      goal({ id: 'g1', description: '   ' }),
      goal({ id: 'g2', description: 'For my brother.' }),
    ];
    expect(deriveReviewWhy(goals)).toBe('For my brother.');
  });

  it('is null when no goal has a why', () => {
    expect(deriveReviewWhy([goal({ id: 'g1' })])).toBeNull();
  });
});

describe('room for more', () => {
  const cards = (marks: { name: string; done: number; target: number }[]): ReviewGoalCard[] => [
    {
      goalId: 'g1',
      title: 'Goal',
      weeksIn: 2,
      marks: marks.map((m, i) => ({ markId: `m${i}`, ...m, met: m.done >= m.target })),
    },
  ];

  it('names the started mark closest to its target', () => {
    const room = deriveRoomForMore(
      cards([
        { name: 'Water', done: 3, target: 7 },
        { name: 'Workout', done: 2, target: 3 },
      ]),
    );
    expect(room).toEqual({ markName: 'Workout' });
  });

  it('never surfaces an unstarted or already-met mark', () => {
    expect(
      deriveRoomForMore(
        cards([
          { name: 'Water', done: 7, target: 7 },
          { name: 'Meal Prep', done: 0, target: 1 },
        ]),
      ),
    ).toBeNull();
  });
});

describe('copy selection', () => {
  it('headline tiers', () => {
    expect(selectHeadline({ ...baseCtx, firstWeek: true })).toBe('You started. That was the hard part.');
    expect(selectHeadline({ ...baseCtx, daysActiveCount: 0 })).toBe('A quiet week.');
    expect(selectHeadline({ ...baseCtx, daysActiveCount: 6 })).toBe('A full week.');
    expect(selectHeadline({ ...baseCtx, daysActiveCount: 4 })).toBe('A steady week.');
    expect(selectHeadline({ ...baseCtx, daysActiveCount: 1 })).toBe('You kept the thread.');
  });

  it('prose counts days and marks, singular handled', () => {
    expect(selectProse({ ...baseCtx, daysActiveCount: 5, marksLogged: 1 })).toBe(
      'You showed up 5 of 7 days and logged 1 mark.',
    );
    expect(selectProse({ ...baseCtx, momentumHeld: true })).toMatch(/Momentum held the whole way through\.$/);
  });

  it('first-week prose encourages, with and without logs', () => {
    expect(selectProse({ ...baseCtx, firstWeek: true, daysActiveCount: 2, marksLogged: 3 })).toBe(
      '2 days in, you have already logged 3 marks. Most people never write the first one down.',
    );
    expect(selectProse({ ...baseCtx, firstWeek: true, daysActiveCount: 0, marksLogged: 0 })).toBe(
      'Your goals are in place. The first mark is the hardest one, and next week is ready for it.',
    );
  });

  it('closing names at most one mark and keeps the why thread', () => {
    expect(selectClosing({ ...baseCtx, hasWhy: true, roomForMore: { markName: 'Workout' } })).toBe(
      'That is still the reason. Next week, Workout has room for one more.',
    );
    expect(selectClosing({ ...baseCtx, everyMarkMet: true })).toBe(
      'Every mark landed where you aimed it. Carry the same rhythm into next week.',
    );
    expect(selectClosing({ ...baseCtx, firstWeek: true, hasWhy: true })).toBe(
      'That is why you began. Next week is the first full one. Nothing to prove yet, just keep the thread.',
    );
    expect(selectClosing({ ...baseCtx })).toBe(
      'Next week is wide open. One mark on Monday is enough to begin it.',
    );
  });

  it('a zero is never rendered (hard invariant, ux-psychology rule 2)', () => {
    const quietWeek: CopyContext = { ...baseCtx, daysActiveCount: 0, marksLogged: 0 };
    const quietFirst: CopyContext = { ...baseCtx, firstWeek: true, daysActiveCount: 0, marksLogged: 0 };
    for (const ctx of [quietWeek, quietFirst]) {
      for (const text of [selectHeadline(ctx), selectProse(ctx), selectClosing(ctx)]) {
        expect(text).not.toMatch(/0/);
      }
    }
  });
});

describe('deriveWeeklyReview assembly', () => {
  const inputs = (over: Partial<DeriveWeeklyReviewInputs> = {}): DeriveWeeklyReviewInputs => ({
    todayStr: '2026-08-29', // Saturday → reviews the week of 2026-08-24
    goals: [
      goal({ id: 'g1', description: 'For my brother.', sort_index: 1 }),
      goal({ id: 'g2', title: 'Grow my business', sort_index: 0, created_at: '2026-08-10T00:00:00.000Z' }),
    ],
    marksByGoal: {
      g1: [
        { id: 'm1', name: 'Water', weekly_target: 7, dailyTarget: 1 },
        { id: 'm2', name: 'Workout', weekly_target: 3, dailyTarget: 1 },
      ],
      g2: [{ id: 'm3', name: 'Deep Focus', weekly_target: 5, dailyTarget: 2 }],
    },
    events: [
      ev({ mark_id: 'm1', occurred_local_date: '2026-08-24' }),
      ev({ mark_id: 'm1', occurred_local_date: '2026-08-25' }),
      ev({ mark_id: 'm2', occurred_local_date: '2026-08-25' }),
      ev({ mark_id: 'm2', occurred_local_date: '2026-08-26' }),
      // dailyTarget 2: one log is not a completed day, two are
      ev({ mark_id: 'm3', occurred_local_date: '2026-08-27' }),
      ev({ mark_id: 'm3', occurred_local_date: '2026-08-28' }),
      ev({ mark_id: 'm3', occurred_local_date: '2026-08-28' }),
    ],
    snapshots: { g1: snap('held'), g2: snap('held') },
    ...over,
  });

  it('returns null with no active goals', () => {
    expect(deriveWeeklyReview(inputs({ goals: [] }))).toBeNull();
    expect(deriveWeeklyReview(inputs({ goals: [goal({ id: 'g1', status: 'completed' })] }))).toBeNull();
  });

  it('derives the reviewed week end to end', () => {
    const r = deriveWeeklyReview(inputs());
    expect(r).not.toBeNull();
    expect(r!.weekStart).toBe('2026-08-24');
    expect(r!.weekLabel).toBe('Week of August 24');
    expect(r!.daysActive).toEqual([true, true, true, true, true, false, false]);
    expect(r!.daysActiveCount).toBe(5);
    expect(r!.marksLogged).toBe(7);
    expect(r!.firstWeek).toBe(false);
    expect(r!.momentumHeld).toBe(true);
    // canonical goal order: sort_index ascending → g2 first
    expect(r!.goals.map((g) => g.goalId)).toEqual(['g2', 'g1']);
    const focus = r!.goals[0].marks[0];
    expect(focus).toMatchObject({ name: 'Deep Focus', done: 1, target: 5, met: false }); // the single-log day did not meet the bar
    const workout = r!.goals[1].marks[1];
    expect(workout).toMatchObject({ name: 'Workout', done: 2, target: 3, met: false });
    expect(r!.why).toBe('For my brother.'); // g2 has none; g1 is next in order
    expect(r!.closing).toContain('Workout has room for one more'); // gap 1 beats Water gap 5 and Focus gap 4
    expect(r!.prose).toBe('You showed up 5 of 7 days and logged 7 marks. Momentum held the whole way through.');
  });

  it('weeksIn counts whole weeks, week one at zero', () => {
    const r = deriveWeeklyReview(
      inputs({
        goals: [
          goal({ id: 'g1', created_at: '2026-08-25T00:00:00.000Z' }),
          goal({ id: 'g2', created_at: '2026-07-11T00:00:00.000Z', sort_index: 2 }),
        ],
        marksByGoal: { g1: [], g2: [] },
      }),
    );
    expect(r!.goals[0].weeksIn).toBe(0);
    expect(r!.goals[1].weeksIn).toBe(7);
  });

  it('first-week dataset labels and copy hold with almost nothing logged', () => {
    const r = deriveWeeklyReview(
      inputs({
        goals: [goal({ id: 'g1', created_at: '2026-08-28T00:00:00.000Z' })],
        marksByGoal: { g1: [{ id: 'm1', name: 'Water', weekly_target: 7, dailyTarget: 1 }] },
        events: [ev({ mark_id: 'm1', occurred_local_date: '2026-08-28' })],
        snapshots: { g1: snap('held') },
      }),
    );
    expect(r!.firstWeek).toBe(true);
    expect(r!.weekLabel).toBe('Your first days');
    expect(r!.headline).toBe('You started. That was the hard part.');
    expect(r!.prose).toBe('1 day in, you have already logged 1 mark. Most people never write the first one down.');
  });
});
