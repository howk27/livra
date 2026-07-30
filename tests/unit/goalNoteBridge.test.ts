// M9 Phase 2 — the goal-note cache bridge.
//
// Goal notes are the SECOND entity where invalidate is the wrong bridge: the store
// persists to SQLite/AsyncStorage and fires the Supabase write off without awaiting
// it, so a refetch would race the insert and drop the entry the user just typed.
// These pin the same guarantees the check-in bridge has — immediate appearance,
// idempotence by id, correct newest-first position, no seeding of an unfetched
// cache, and removal on delete.

import { queryClient } from '../../lib/data/queryClient';
import { queryKeys } from '../../lib/data/queryKeys';
import { bridgeGoalNoteUpserted, bridgeGoalNoteRemoved } from '../../lib/data/bridge';
import type { GoalNote } from '../../types';

const USER = 'user-1';
const GOAL = 'goal-1';
const KEY = queryKeys.goalNotes(USER, GOAL);

function makeNote(overrides: Partial<GoalNote> = {}): GoalNote {
  return {
    id: 'note-1',
    goal_id: GOAL,
    user_id: USER,
    local_date: '2026-07-30',
    text: 'Ran four miles, felt easy for once.',
    created_at: '2026-07-30T10:00:00.000Z',
    updated_at: '2026-07-30T10:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  queryClient.clear();
});

describe('bridgeGoalNoteUpserted', () => {
  test('adds the entry to the goal cache', () => {
    queryClient.setQueryData<GoalNote[]>(KEY, []);

    bridgeGoalNoteUpserted(makeNote());

    const rows = queryClient.getQueryData<GoalNote[]>(KEY)!;
    expect(rows).toHaveLength(1);
    expect(rows[0].text).toBe('Ran four miles, felt easy for once.');
  });

  test('newest-first: a new entry lands at the head', () => {
    const older = makeNote({ id: 'note-old', created_at: '2026-07-30T08:00:00.000Z' });
    queryClient.setQueryData<GoalNote[]>(KEY, [older]);

    bridgeGoalNoteUpserted(makeNote({ id: 'note-new' }));

    expect(queryClient.getQueryData<GoalNote[]>(KEY)!.map((n) => n.id)).toEqual([
      'note-new',
      'note-old',
    ]);
  });

  test('ties on created_at break by id descending — the same total order the query asks for', () => {
    const a = makeNote({ id: 'aaa' });
    const c = makeNote({ id: 'ccc' });
    queryClient.setQueryData<GoalNote[]>(KEY, [c, a]);

    bridgeGoalNoteUpserted(makeNote({ id: 'bbb' }));

    expect(queryClient.getQueryData<GoalNote[]>(KEY)!.map((n) => n.id)).toEqual([
      'ccc',
      'bbb',
      'aaa',
    ]);
  });

  test('is idempotent by id — a real refetch carrying the same id must not double it', () => {
    queryClient.setQueryData<GoalNote[]>(KEY, []);

    bridgeGoalNoteUpserted(makeNote());
    bridgeGoalNoteUpserted(makeNote());

    expect(queryClient.getQueryData<GoalNote[]>(KEY)).toHaveLength(1);
  });

  test('an edit replaces the entry in place, keeping its position', () => {
    const newer = makeNote({ id: 'note-newer', created_at: '2026-07-30T12:00:00.000Z' });
    queryClient.setQueryData<GoalNote[]>(KEY, [newer, makeNote()]);

    bridgeGoalNoteUpserted(makeNote({ text: 'edited', updated_at: '2026-07-30T13:00:00.000Z' }));

    const rows = queryClient.getQueryData<GoalNote[]>(KEY)!;
    expect(rows.map((n) => n.id)).toEqual(['note-newer', 'note-1']);
    expect(rows[1].text).toBe('edited');
  });

  test('does NOT seed a goal cache that was never fetched', () => {
    bridgeGoalNoteUpserted(makeNote());
    expect(queryClient.getQueryData(KEY)).toBeUndefined();
  });

  test('touches only the note’s own goal', () => {
    const otherKey = queryKeys.goalNotes(USER, 'goal-2');
    queryClient.setQueryData<GoalNote[]>(KEY, []);
    queryClient.setQueryData<GoalNote[]>(otherKey, []);

    bridgeGoalNoteUpserted(makeNote());

    expect(queryClient.getQueryData<GoalNote[]>(otherKey)).toEqual([]);
  });
});

describe('bridgeGoalNoteRemoved', () => {
  test('drops the entry and leaves the others', () => {
    const a = makeNote({ id: 'a', created_at: '2026-07-30T09:00:00.000Z' });
    const b = makeNote({ id: 'b' });
    queryClient.setQueryData<GoalNote[]>(KEY, [b, a]);

    bridgeGoalNoteRemoved({ userId: USER, goalId: GOAL, noteId: 'a' });

    expect(queryClient.getQueryData<GoalNote[]>(KEY)!.map((n) => n.id)).toEqual(['b']);
  });

  test('does not seed an unfetched cache', () => {
    bridgeGoalNoteRemoved({ userId: USER, goalId: GOAL, noteId: 'a' });
    expect(queryClient.getQueryData(KEY)).toBeUndefined();
  });
});
