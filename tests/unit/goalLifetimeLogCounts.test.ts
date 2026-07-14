// tests/unit/goalLifetimeLogCounts.test.ts
// buildGoalLifetimeLogCounts (PL-3 M1, fallow retry #1 extraction from Focus):
// lifetime log EVENTS per goal, attributed through each mark's goal_id.

jest.mock('../../lib/appDate', () => ({ getAppDate: jest.fn(() => new Date()) }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));
// appDateSlice is imported by lib/appDate at module level — stub it out.
jest.mock('../../state/appDateSlice', () => ({
  useAppDateStore: { getState: jest.fn(() => ({ debugDateOverride: undefined })) },
}));

import { buildGoalLifetimeLogCounts } from '../../lib/features';
import type { Mark, MarkEvent } from '../../types';

type MarkInput = Pick<Mark, 'id' | 'goal_id'>;

function makeEvent(overrides: Partial<MarkEvent> = {}): MarkEvent {
  return {
    id: overrides.id ?? 'e1',
    user_id: 'u1',
    mark_id: overrides.mark_id ?? 'm1',
    event_type: overrides.event_type ?? 'increment',
    amount: overrides.amount ?? 1,
    occurred_at: overrides.occurred_at ?? '2026-07-14T09:00:00.000Z',
    occurred_local_date: overrides.occurred_local_date ?? '2026-07-14',
    created_at: '2026-07-14T09:00:00.000Z',
    updated_at: '2026-07-14T09:00:00.000Z',
    ...overrides,
  };
}

const marks: MarkInput[] = [
  { id: 'm1', goal_id: 'g1' },
  { id: 'm2', goal_id: 'g1' },
  { id: 'm3', goal_id: 'g2' },
  { id: 'm4', goal_id: null }, // goalless (daily habit)
  { id: 'm5' }, // goal_id absent entirely
];

describe('buildGoalLifetimeLogCounts', () => {
  it('returns 0 for every requested goal when there are no events', () => {
    expect(buildGoalLifetimeLogCounts(marks, ['g1', 'g2'], [])).toEqual({ g1: 0, g2: 0 });
  });

  it('returns an empty record when no goals are requested', () => {
    expect(buildGoalLifetimeLogCounts(marks, [], [makeEvent()])).toEqual({});
  });

  it('attributes events to the right goal across multiple marks and goals', () => {
    const events = [
      makeEvent({ id: 'e1', mark_id: 'm1' }),
      makeEvent({ id: 'e2', mark_id: 'm2' }),
      makeEvent({ id: 'e3', mark_id: 'm2' }),
      makeEvent({ id: 'e4', mark_id: 'm3' }),
    ];
    expect(buildGoalLifetimeLogCounts(marks, ['g1', 'g2'], events)).toEqual({ g1: 3, g2: 1 });
  });

  it('counts events, not amounts (a 5-amount log is one log)', () => {
    const events = [makeEvent({ id: 'e1', mark_id: 'm1', amount: 5 })];
    expect(buildGoalLifetimeLogCounts(marks, ['g1'], events)).toEqual({ g1: 1 });
  });

  it('excludes soft-deleted events', () => {
    const events = [
      makeEvent({ id: 'e1', mark_id: 'm1' }),
      makeEvent({ id: 'e2', mark_id: 'm1', deleted_at: '2026-07-14T10:00:00.000Z' }),
    ];
    expect(buildGoalLifetimeLogCounts(marks, ['g1'], events)).toEqual({ g1: 1 });
  });

  it('excludes non-increment events (reset, decrement)', () => {
    const events = [
      makeEvent({ id: 'e1', mark_id: 'm1', event_type: 'reset' }),
      makeEvent({ id: 'e2', mark_id: 'm1', event_type: 'decrement' }),
      makeEvent({ id: 'e3', mark_id: 'm1' }),
    ];
    expect(buildGoalLifetimeLogCounts(marks, ['g1'], events)).toEqual({ g1: 1 });
  });

  it('ignores events on goalless marks and on marks whose goal was not requested', () => {
    const events = [
      makeEvent({ id: 'e1', mark_id: 'm4' }), // goal_id null
      makeEvent({ id: 'e2', mark_id: 'm5' }), // goal_id absent
      makeEvent({ id: 'e3', mark_id: 'm3' }), // g2, not requested
      makeEvent({ id: 'e4', mark_id: 'unknown-mark' }),
    ];
    expect(buildGoalLifetimeLogCounts(marks, ['g1'], events)).toEqual({ g1: 0 });
  });

  it('the first-ever log on a goal yields exactly 1 (the M1 firstLog predicate)', () => {
    const events = [makeEvent({ id: 'e1', mark_id: 'm3' })];
    expect(buildGoalLifetimeLogCounts(marks, ['g1', 'g2'], events)).toEqual({ g1: 0, g2: 1 });
  });
});
