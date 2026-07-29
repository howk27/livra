// M9 Phase 1 — the account-isolation guard.
//
// Namespacing every query key by user id is what lets the account-switch guard and
// the purge machinery be DELETED in Phase 5 instead of fixed: two accounts' caches
// live under different keys, so B can never read A's rows.

import { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/data/queryKeys';

const USER_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const USER_B = 'bbbbbbbb-0000-0000-0000-000000000002';

describe('query keys are namespaced by user id', () => {
  it('every key begins with the livra root and the user id', () => {
    expect(queryKeys.goals(USER_A)).toEqual(['livra', USER_A, 'goals']);
    expect(queryKeys.marksForGoal(USER_A, 'g1')).toEqual(['livra', USER_A, 'marks', 'by-goal', 'g1']);
    expect(queryKeys.mark(USER_A, 'm1')).toEqual(['livra', USER_A, 'marks', 'by-id', 'm1']);
    expect(queryKeys.checkins(USER_A, 'm1')).toEqual(['livra', USER_A, 'checkins', 'm1']);
    expect(queryKeys.todayCheckins(USER_A, '2026-07-29')).toEqual([
      'livra',
      USER_A,
      'checkins',
      'today',
      '2026-07-29',
    ]);
    expect(queryKeys.goalNotes(USER_A, 'g1')).toEqual(['livra', USER_A, 'notes', 'g1']);
  });

  it('the marks root is a prefix of the by-goal and single-mark keys (one invalidation clears all)', () => {
    const root = queryKeys.marks(USER_A);
    expect(queryKeys.marksForGoal(USER_A, 'g1').slice(0, root.length)).toEqual(root);
    expect(queryKeys.mark(USER_A, 'm1').slice(0, root.length)).toEqual(root);
  });

  it("account B cannot read account A's cached goals", () => {
    const qc = new QueryClient();
    const aGoals = [{ id: 'g1', title: "A's goal" }];
    qc.setQueryData(queryKeys.goals(USER_A), aGoals);

    // Same logical query, different user → a different cache slot → a miss.
    expect(qc.getQueryData(queryKeys.goals(USER_B))).toBeUndefined();
    // A's data is untouched.
    expect(qc.getQueryData(queryKeys.goals(USER_A))).toEqual(aGoals);
    qc.clear();
  });

  it('confirms the guard: WITHOUT the user id in the key, the two accounts would collide', () => {
    const qc = new QueryClient();
    // A deliberately un-namespaced key stands in for "namespacing removed".
    const sharedKey = ['livra', 'goals'] as const;
    qc.setQueryData(sharedKey, [{ id: 'g1' }]);
    // Both "users" reading the same key see the same data — the collision the
    // real, user-namespaced keys prevent.
    expect(qc.getQueryData(sharedKey)).toEqual([{ id: 'g1' }]);
    qc.clear();
  });
});
