// PL-4: pure post-log voice evaluation — store data in, Moment | null out.
import {
  evaluatePostLogVoice,
  buildTodayCounts,
  computeAccountFirstVariant,
} from '../../../lib/moments/postLogVoice';
import type { PostLogVoiceInputs } from '../../../lib/moments/postLogVoice';
import type { IdentityMilestone } from '../../../lib/identity';
import type { Mark, MarkEvent } from '../../../types';

const TODAY = '2026-07-14'; // Tuesday
const WEEK = [
  '2026-07-13',
  '2026-07-14',
  '2026-07-15',
  '2026-07-16',
  '2026-07-17',
  '2026-07-18',
  '2026-07-19',
];

const speak = () => 0; // below the 1-in-3 gate → engine speaks
const silent = () => 0.9; // above the gate → silence

function makeMark(overrides: Partial<Mark> = {}): Mark {
  return {
    id: 'm1',
    user_id: 'u1',
    name: 'Run',
    unit: 'sessions',
    enable_streak: false,
    sort_index: 0,
    total: 5,
    created_at: '2026-06-01T08:00:00Z',
    updated_at: '2026-07-14T08:00:00Z',
    goal_id: 'g1',
    weekly_target: 3,
    dailyTarget: 1,
    ...overrides,
  } as Mark;
}

function makeEvent(overrides: Partial<MarkEvent> = {}): MarkEvent {
  return {
    id: 'e1',
    user_id: 'u1',
    mark_id: 'm1',
    event_type: 'increment',
    amount: 1,
    occurred_at: '2026-07-14T10:00:00Z',
    occurred_local_date: TODAY,
    created_at: '2026-07-14T10:00:00Z',
    updated_at: '2026-07-14T10:00:00Z',
    ...overrides,
  } as MarkEvent;
}

const goal = {
  id: 'g1',
  title: 'Run a marathon',
  description: null,
  created_at: '2026-06-01T08:00:00Z',
  status: 'active',
};

function makeInputs(overrides: Partial<PostLogVoiceInputs> = {}): PostLogVoiceInputs {
  return {
    markId: 'm1',
    todayStr: TODAY,
    weekDates: WEEK,
    firstName: 'Dei',
    marks: [makeMark()],
    // Two lifetime events (one two days old) so the M1 firstLog bypass does not
    // fire, and the gap stays under the 3-day comeback threshold (Task 4) so
    // the new comeback row does not swallow every baseline test below.
    events: [
      makeEvent(),
      makeEvent({ id: 'e0', occurred_local_date: '2026-07-12', occurred_at: '2026-07-12T10:00:00Z' }),
    ],
    goals: [goal],
    snapshots: {},
    rng: speak,
    ...overrides,
  };
}

describe('evaluatePostLogVoice — selector-to-render wiring', () => {
  it('returns a postLog moment when the gate opens', () => {
    const m = evaluatePostLogVoice(makeInputs());
    expect(m).not.toBeNull();
    expect(m!.surface).toBe('postLog');
    expect(m!.text.length).toBeGreaterThan(0);
  });

  it('returns null when the variable-ratio gate stays closed (the majority case)', () => {
    expect(evaluatePostLogVoice(makeInputs({ rng: silent }))).toBeNull();
  });

  it('returns null for an unknown mark', () => {
    expect(evaluatePostLogVoice(makeInputs({ markId: 'nope' }))).toBeNull();
  });

  it('returns null for a soft-deleted mark', () => {
    expect(
      evaluatePostLogVoice(makeInputs({ marks: [makeMark({ deleted_at: '2026-07-01T00:00:00Z' })] })),
    ).toBeNull();
  });
});

describe('evaluatePostLogVoice — contextual variants', () => {
  it('picks closesWeek when this log completes the weekly target', () => {
    const m = evaluatePostLogVoice(
      makeInputs({ marks: [makeMark({ weekly_target: 1 })] }),
    );
    expect(m).not.toBeNull();
    expect(m!.id.startsWith('postLog.closesWeek.')).toBe(true);
  });

  it('picks closesDay when every due mark logged today', () => {
    // weekly_target 3 keeps m1 due; the day's log makes allDoneForDay true.
    const m = evaluatePostLogVoice(makeInputs());
    expect(m!.id.startsWith('postLog.closesDay.')).toBe(true);
  });

  it('slippingGentle outranks closesWeek when the goal is slipping', () => {
    const m = evaluatePostLogVoice(
      makeInputs({
        marks: [makeMark({ weekly_target: 1 })],
        snapshots: { g1: { state: 'slipping', days: 3, cushionRemaining: 0.4 } as never },
      }),
    );
    expect(m!.id.startsWith('postLog.slippingGentle.')).toBe(true);
  });

  it('picks the rest bonusLog when the week was already closed before this log (QC2-F)', () => {
    // weekly_target 1, met on Monday; today (Tuesday) logs again → count 2 > 1.
    // A third, long-past event pushes the account outside the Task 4
    // first-week window so accountFirstVariant (e.g. dayTwoReturn, which this
    // Monday-then-Tuesday shape would otherwise also match) stays null.
    const m = evaluatePostLogVoice(
      makeInputs({
        marks: [makeMark({ weekly_target: 1 })],
        events: [
          makeEvent(),
          makeEvent({
            id: 'e0',
            occurred_local_date: '2026-07-13',
            occurred_at: '2026-07-13T10:00:00Z',
          }),
          makeEvent({
            id: 'eOld',
            occurred_local_date: '2026-06-01',
            occurred_at: '2026-06-01T10:00:00Z',
          }),
        ],
      }),
    );
    expect(m).not.toBeNull();
    expect(m!.id.startsWith('rest.bonusLog.')).toBe(true);
  });

  it('the bonus acknowledgment rides the gate — silence stays the majority case (QC2-F)', () => {
    const m = evaluatePostLogVoice(
      makeInputs({
        marks: [makeMark({ weekly_target: 1 })],
        events: [
          makeEvent(),
          makeEvent({
            id: 'e0',
            occurred_local_date: '2026-07-13',
            occurred_at: '2026-07-13T10:00:00Z',
          }),
          makeEvent({
            id: 'eOld',
            occurred_local_date: '2026-06-01',
            occurred_at: '2026-06-01T10:00:00Z',
          }),
        ],
        rng: silent,
      }),
    );
    expect(m).toBeNull();
  });

  it('the first-ever log on a goal bypasses the gate, but the account-scoped firstEver outranks it when this is ALSO the very first log on the account (Task 4)', () => {
    const m = evaluatePostLogVoice(
      makeInputs({ events: [makeEvent()], rng: silent }),
    );
    expect(m).not.toBeNull();
    expect(m!.id.startsWith('postLog.firstEver.')).toBe(true);
  });

  it('the goal-scoped firstLog still fires when the ACCOUNT already has other activity outside the goal (Task 4 priority)', () => {
    const m = evaluatePostLogVoice(
      makeInputs({
        marks: [makeMark(), makeMark({ id: 'm2', goal_id: 'g2' })],
        goals: [goal, { ...goal, id: 'g2', title: 'Other goal' }],
        events: [
          makeEvent(), // m1/g1's first-ever log, today
          makeEvent({
            id: 'eOther',
            mark_id: 'm2',
            occurred_local_date: '2026-07-12',
            occurred_at: '2026-07-12T10:00:00Z',
          }),
        ],
        rng: silent,
      }),
    );
    expect(m).not.toBeNull();
    expect(m!.id.startsWith('firstWeek.firstLog.')).toBe(true);
  });
});

describe('buildTodayCounts', () => {
  it('sums today increments and ignores deleted, non-increment, and other-day events', () => {
    const counts = buildTodayCounts(
      [
        makeEvent(),
        makeEvent({ id: 'e2', amount: 2 }),
        makeEvent({ id: 'e3', deleted_at: '2026-07-14T11:00:00Z' }),
        makeEvent({ id: 'e4', event_type: 'decrement' }),
        makeEvent({ id: 'e5', occurred_local_date: '2026-07-13' }),
      ],
      TODAY,
    );
    expect(counts).toEqual({ m1: 3 });
  });
});

describe('evaluatePostLogVoice — Task 4: comeback / identity / account-first registers', () => {
  it('comeback outranks everything, including a day-closing log (bypasses the gate)', () => {
    const m = evaluatePostLogVoice(
      makeInputs({
        // Last log 4 days before today ends a comeback gap (>= 3 full quiet days).
        events: [
          makeEvent(),
          makeEvent({ id: 'e0', occurred_local_date: '2026-07-10', occurred_at: '2026-07-10T10:00:00Z' }),
        ],
        rng: silent,
      }),
    );
    expect(m).not.toBeNull();
    expect(m!.type).toBe('comeback');
    expect(m!.id.startsWith('comeback.return.')).toBe(true);
  });

  it('identity claim tier speaks and fills {markName}/{n}', () => {
    const m = evaluatePostLogVoice(
      makeInputs({
        rng: silent,
        identityMilestone: { id: 'identity-12w3', tier: 'identity', n: 15 },
      }),
    );
    expect(m).not.toBeNull();
    expect(m!.type).toBe('identity');
    expect(m!.id.startsWith('identity.claim.')).toBe(true);
    expect(m!.text).toContain('15');
  });

  it('identity fact tier speaks and names the mark', () => {
    // rng: speak also drives template selection (bypassGate only skips the
    // rate check) — index 0 is '{markName} #{n}. ...', which exercises both slots.
    const m = evaluatePostLogVoice(
      makeInputs({
        rng: speak,
        identityMilestone: { id: 'fact-7', tier: 'fact', n: 7 },
      }),
    );
    expect(m).not.toBeNull();
    expect(m!.type).toBe('identity');
    expect(m!.id.startsWith('identity.fact.')).toBe(true);
    expect(m!.text).toContain('Run'); // default mark name
    expect(m!.text).toContain('7');
  });

  it('a null identityMilestone (already-fired, filtered by the caller) falls through to existing behavior', () => {
    const withNull = evaluatePostLogVoice(makeInputs({ rng: speak, identityMilestone: null }));
    const withoutField = evaluatePostLogVoice(makeInputs({ rng: speak }));
    expect(withNull).not.toBeNull();
    expect(withNull!.id).toBe(withoutField!.id);
    expect(withNull!.type).not.toBe('identity');
  });

  it('firstEver fires on the very first log on the account, account-wide (bypasses the gate)', () => {
    const m = evaluatePostLogVoice(makeInputs({ events: [makeEvent()], rng: silent }));
    expect(m).not.toBeNull();
    expect(m!.type).toBe('postLog');
    expect(m!.id.startsWith('postLog.firstEver.')).toBe(true);
  });

  it('dayTwoReturn fires when yesterday was the only prior log date, within the first week', () => {
    const m = evaluatePostLogVoice(
      makeInputs({
        events: [
          makeEvent(), // today
          makeEvent({ id: 'e0', occurred_local_date: '2026-07-13', occurred_at: '2026-07-13T10:00:00Z' }), // yesterday
        ],
        rng: silent,
      }),
    );
    expect(m).not.toBeNull();
    expect(m!.id.startsWith('postLog.dayTwoReturn.')).toBe(true);
  });

  it('weekOne fires when the earliest log is exactly 6 days before today and this is the first log today', () => {
    const m = evaluatePostLogVoice(
      makeInputs({
        events: [
          makeEvent(), // today, 2026-07-14
          makeEvent({ id: 'e0', occurred_local_date: '2026-07-08', occurred_at: '2026-07-08T10:00:00Z' }), // exactly 6 days earlier
          // Yesterday too, so the account's most recent prior activity stays
          // inside the 3-day comeback threshold (comeback must NOT fire here).
          makeEvent({ id: 'e1', occurred_local_date: '2026-07-13', occurred_at: '2026-07-13T10:00:00Z' }),
        ],
        rng: silent,
      }),
    );
    expect(m).not.toBeNull();
    expect(m!.id.startsWith('postLog.weekOne.')).toBe(true);
  });

  it('comeback suppresses accountFirstVariant entirely (spec §2/§3 coordination)', () => {
    // Same shape that produces dayTwoReturn above, but the prior log is far
    // enough back to ALSO end a comeback gap once today's log is excluded.
    const withoutGap = computeAccountFirstVariant(
      [
        makeEvent(),
        makeEvent({ id: 'e0', occurred_local_date: '2026-07-13', occurred_at: '2026-07-13T10:00:00Z' }),
      ],
      TODAY,
      false,
      false,
    );
    expect(withoutGap).toBe('dayTwoReturn');

    const withGap = computeAccountFirstVariant(
      [
        makeEvent(),
        makeEvent({ id: 'e0', occurred_local_date: '2026-07-13', occurred_at: '2026-07-13T10:00:00Z' }),
      ],
      TODAY,
      false,
      true, // endsComebackGapFlag
    );
    expect(withGap).toBeNull();
  });

  it('accountFirstVariant stays null outside the first-week window (spec §2: earliestLogDate >= todayStr - 7)', () => {
    const variant = computeAccountFirstVariant(
      [
        // Earliest log 8 days before TODAY — one day past the window.
        makeEvent({ id: 'e0', occurred_local_date: '2026-07-06', occurred_at: '2026-07-06T10:00:00Z' }),
        makeEvent(), // today
      ],
      TODAY,
      false,
      false,
    );
    expect(variant).toBeNull();
  });

  it('the window is inclusive at exactly 7 days (weekOne needs earliest = today - 6, still inside the window)', () => {
    // Sanity check that the window guard (accountAgeDays > 7) does not clip
    // the weekOne boundary itself: earliest log 6 days back has accountAgeDays
    // 6, safely inside "<= 7".
    const variant = computeAccountFirstVariant(
      [
        makeEvent({ id: 'e0', occurred_local_date: '2026-07-08', occurred_at: '2026-07-08T10:00:00Z' }), // 6 days before TODAY
        makeEvent(), // today, first log today
      ],
      TODAY,
      false,
      false,
    );
    expect(variant).toBe('weekOne');
  });
});
