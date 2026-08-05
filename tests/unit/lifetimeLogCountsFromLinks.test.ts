import { buildGoalLifetimeLogCounts, lifetimeLogCountsFromLinks } from '../../lib/features';
import type { MarkEvent } from '../../types';

const ev = (markId: string, over: Partial<MarkEvent> = {}): MarkEvent =>
  ({
    id: `e-${markId}-${Math.random()}`,
    user_id: 'u1',
    mark_id: markId,
    event_type: 'increment',
    amount: 1,
    occurred_at: '2026-08-03T12:00:00Z',
    occurred_local_date: '2026-08-03',
    deleted_at: null,
    created_at: '',
    updated_at: '',
    ...over,
  }) as MarkEvent;

describe('lifetimeLogCountsFromLinks', () => {
  it('counts events for a goal whose marks are known only through links', () => {
    // The query layer's Mark carries NO goal_id (lib/data/adapters.ts toMark) —
    // this is the exact shape that made the old call read 0 forever.
    const marksByGoal = { g1: [{ id: 'm1' }, { id: 'm2' }] };
    const events = [ev('m1'), ev('m1'), ev('m2')];
    expect(lifetimeLogCountsFromLinks(marksByGoal, ['g1'], events)).toEqual({ g1: 3 });
  });

  it('pins the trap: goal_id-less marks count 0 through the old entry point', () => {
    const goalIdLess = [{ id: 'm1', goal_id: undefined as unknown as string }];
    expect(buildGoalLifetimeLogCounts(goalIdLess, ['g1'], [ev('m1')])).toEqual({ g1: 0 });
  });

  it('ignores deleted and non-increment events; unknown goals stay 0', () => {
    const marksByGoal = { g1: [{ id: 'm1' }], g2: [] as { id: string }[] };
    const events = [
      ev('m1'),
      ev('m1', { deleted_at: '2026-08-03T13:00:00Z' }),
      ev('m1', { event_type: 'decrement' as MarkEvent['event_type'] }),
    ];
    expect(lifetimeLogCountsFromLinks(marksByGoal, ['g1', 'g2'], events)).toEqual({ g1: 1, g2: 0 });
  });
});
