// T7a (build 65): a mark linked under TWO goals has exactly one voice holder —
// the first goal in the goals array's CANONICAL order — while Focus's lifetime
// counts credit every holder. Both semantics pinned here so neither drifts
// silently into the other (QC64 carried finding, ledger 2026-08-04 (b)).

import { holderByMarkFromSnapshot } from '../../lib/goals/momentumEvaluation';
import { lifetimeLogCountsFromLinks } from '../../lib/features';

const goal = (id: string, title = id) =>
  ({ id, title, status: 'active' }) as any;
const mark = (id: string) => ({ id }) as any;

describe('shared-mark holder vs lifetime-count semantics', () => {
  const snapshot = {
    goals: [goal('goal-a'), goal('goal-b')],
    marks: [mark('shared'), mark('only-b')],
    marksByGoal: {
      // Deliberately declare goal-b's key FIRST: object insertion order must
      // not decide the holder — the goals array's order must.
      'goal-b': [mark('shared'), mark('only-b')],
      'goal-a': [mark('shared')],
    },
    events: [],
  } as any;

  it('voice holder is the first goal in canonical order, not key order', () => {
    const holder = holderByMarkFromSnapshot(snapshot);
    expect(holder.get('shared')).toBe('goal-a');
    expect(holder.get('only-b')).toBe('goal-b');
  });

  it('holder is deterministic under reversed key insertion', () => {
    const reversed = {
      ...snapshot,
      marksByGoal: {
        'goal-a': [mark('shared')],
        'goal-b': [mark('shared'), mark('only-b')],
      },
    };
    expect(holderByMarkFromSnapshot(reversed).get('shared')).toBe('goal-a');
  });

  it('lifetime counts credit EVERY holder of a shared mark (spec D-6)', () => {
    const increment = (markId: string) =>
      ({ mark_id: markId, event_type: 'increment', deleted_at: null, value: 1 }) as any;
    const counts = lifetimeLogCountsFromLinks(
      {
        'goal-a': [mark('shared')],
        'goal-b': [mark('shared'), mark('only-b')],
      },
      ['goal-a', 'goal-b'],
      [increment('shared'), increment('shared'), increment('only-b')],
    );
    expect(counts['goal-a']).toBe(2);
    expect(counts['goal-b']).toBe(3);
  });
});
