/**
 * M9 Phase 3 Task 6 — the create-mark pre-flight gate.
 *
 * `useCounters.createMark` carried these checks inline; `hooks/useCreateMark.ts`
 * now exposes them as the pure `assertCanCreateMark` so they are provable without
 * React or a network. The thrown SHAPES are the contract: mark/new's
 * `handleCreateMarkError` branches on DuplicateMarkError, the PRO_STATUS_UNKNOWN
 * prefix and the FREE_COUNTER_LIMIT_REACHED prefix, exactly as before.
 *
 * These are UX walls, not enforcement — RLS on public.marks is the enforcement.
 * The per-goal count comes from live LINKS now (marks.goal_id is retired), which
 * is why the gate takes a count, not a goal-id-filtered list.
 */

import { assertCanCreateMark, type CreateMarkGate } from '../../hooks/useCreateMark';
import { DuplicateMarkError } from '../../lib/errors';
import { MARK_PER_GOAL_LIMIT_MESSAGE, MARK_CEILING_MESSAGE } from '../../lib/copy';

// The hook module pulls IAP + badges + react-query; the pure gate needs none of
// them, so the heavy neighbours are stubbed (jest hoists these above the imports).
jest.mock('../../hooks/useIapSubscriptions', () => ({ useIapSubscriptions: () => ({}) }));
jest.mock('../../hooks/useBadges', () => ({ useBadges: () => ({}) }));
jest.mock('../../lib/data/mutations/marks', () => ({ useCreateMarkMutation: () => ({}) }));
jest.mock('../../lib/data/marks', () => ({
  fetchMarksForUser: jest.fn(),
  fetchMarksByGoal: jest.fn(),
}));

const marks = (names: string[], deleted: string[] = []) => [
  ...names.map((name) => ({ name, deleted_at: null })),
  ...deleted.map((name) => ({ name, deleted_at: '2026-01-01' })),
];

const base: CreateMarkGate = {
  name: 'Workout',
  goalId: null,
  marks: [],
  marksInGoalCount: 0,
  isProUnlocked: false,
  proStatus: { verification: 'verified', status: 'active' },
};

describe('assertCanCreateMark', () => {
  test('passes with room, no duplicate, verified status', () => {
    expect(() =>
      assertCanCreateMark({ ...base, marks: marks(['Run', 'Water']) }),
    ).not.toThrow();
  });

  test('duplicate name throws DuplicateMarkError, case-insensitively', () => {
    expect(() =>
      assertCanCreateMark({ ...base, name: '  workout ', marks: marks(['Workout']) }),
    ).toThrow(DuplicateMarkError);
  });

  test('a tombstoned mark does not block its name from being reused', () => {
    expect(() =>
      assertCanCreateMark({ ...base, marks: marks([], ['Workout']) }),
    ).not.toThrow();
  });

  test('the duplicate check binds for Pro too — it is about data sense, not tier', () => {
    expect(() =>
      assertCanCreateMark({
        ...base,
        isProUnlocked: true,
        marks: marks(['Workout']),
      }),
    ).toThrow(DuplicateMarkError);
  });

  test('unverifiable Pro status refuses with the PRO_STATUS_UNKNOWN prefix', () => {
    expect(() =>
      assertCanCreateMark({
        ...base,
        proStatus: { verification: 'unverified', status: 'unknown' },
      }),
    ).toThrow(/^PRO_STATUS_UNKNOWN/);
  });

  test('the per-goal wall fires at 4 linked marks, with the per-goal message', () => {
    expect(() =>
      assertCanCreateMark({ ...base, goalId: 'goal-1', marksInGoalCount: 4 }),
    ).toThrow(`FREE_COUNTER_LIMIT_REACHED: ${MARK_PER_GOAL_LIMIT_MESSAGE}`);
  });

  test('an unlinked mark never meets the per-goal wall', () => {
    expect(() =>
      assertCanCreateMark({ ...base, goalId: null, marksInGoalCount: 4 }),
    ).not.toThrow();
  });

  test('the account ceiling fires at 6 live marks, with the ceiling message', () => {
    expect(() =>
      assertCanCreateMark({
        ...base,
        marks: marks(['a', 'b', 'c', 'd', 'e', 'f']),
      }),
    ).toThrow(`FREE_COUNTER_LIMIT_REACHED: ${MARK_CEILING_MESSAGE}`);
  });

  test('tombstoned marks do not count against the ceiling', () => {
    expect(() =>
      assertCanCreateMark({
        ...base,
        marks: marks(['a', 'b', 'c'], ['x', 'y', 'z']),
      }),
    ).not.toThrow();
  });

  test('Pro bypasses both free-tier walls', () => {
    expect(() =>
      assertCanCreateMark({
        ...base,
        isProUnlocked: true,
        goalId: 'goal-1',
        marksInGoalCount: 40,
        marks: marks(Array.from({ length: 40 }, (_, i) => `m${i}`)),
      }),
    ).not.toThrow();
  });
});
