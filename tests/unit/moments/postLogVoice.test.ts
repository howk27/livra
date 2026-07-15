// PL-4: pure post-log voice evaluation — store data in, Moment | null out.
import { evaluatePostLogVoice, buildTodayCounts } from '../../../lib/moments/postLogVoice';
import type { PostLogVoiceInputs } from '../../../lib/moments/postLogVoice';
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
    // Two lifetime events (one old) so the M1 firstLog bypass does not fire.
    events: [
      makeEvent(),
      makeEvent({ id: 'e0', occurred_local_date: '2026-06-10', occurred_at: '2026-06-10T10:00:00Z' }),
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
        ],
        rng: silent,
      }),
    );
    expect(m).toBeNull();
  });

  it('the first-ever log on a goal bypasses the gate (M1 firstLog)', () => {
    const m = evaluatePostLogVoice(
      makeInputs({ events: [makeEvent()], rng: silent }),
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
