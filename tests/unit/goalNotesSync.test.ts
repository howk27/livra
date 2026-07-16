/**
 * QC3-D — goal-level MULTI-ENTRY journal, id-based sync.
 *
 * Contract under test:
 *  1. Each entry is its own row keyed by a CLIENT-GENERATED uuid (`id`) — sync is
 *     purely id-based: add = INSERT with the explicit id, edit = UPDATE by
 *     (id, user_id), delete = DELETE by (id, user_id). No natural-key upsert.
 *  2. A goal may have MANY entries per day — two adds on the same local_date make
 *     two distinct rows, never one merged row.
 *  3. getEntriesForGoal returns newest-first (created_at desc).
 *  4. Non-UUID (signed-out 'local') users never push to the cloud.
 */

const mockInsert = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
const mockUpdateEqCalls: [string, string][] = [];
const mockDeleteEqCalls: [string, string][] = [];
const mockSelectOrder: { column: string; ascending: boolean }[] = [];

let mockQueryResult: { error: unknown; data?: unknown } = { error: null };

function mockMakeQuery(result: { error: unknown; data?: unknown }) {
  const insertQ: any = {
    insert: (...args: unknown[]) => {
      mockInsert(...args);
      return Promise.resolve(result);
    },
    update: (...args: unknown[]) => {
      mockUpdate(...args);
      return updateQ;
    },
    delete: (...args: unknown[]) => {
      mockDelete(...args);
      return deleteQ;
    },
    select: () => selectQ,
  };
  const updateQ: any = {
    eq: (col: string, val: string) => {
      mockUpdateEqCalls.push([col, val]);
      return updateQ;
    },
    then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(onF, onR),
  };
  const deleteQ: any = {
    eq: (col: string, val: string) => {
      mockDeleteEqCalls.push([col, val]);
      return deleteQ;
    },
    then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(onF, onR),
  };
  const selectQ: any = {
    eq: () => selectQ,
    order: (column: string, opts: { ascending: boolean }) => {
      mockSelectOrder.push({ column, ascending: opts.ascending });
      return Promise.resolve(result);
    },
  };
  return insertQ;
}

jest.mock('../../lib/supabase', () => ({
  getSupabaseClient: () => ({
    from: (table: string) => {
      expect(table).toBe('goal_notes');
      return mockMakeQuery(mockQueryResult);
    },
    auth: { getUser: async () => ({ data: { user: null } }) },
  }),
}));

// Route the slice through the AsyncStorage path (no SQLite) for determinism.
jest.mock('../../lib/db/goalNotesSqlite', () => ({
  goalNotesSqliteSupported: () => false,
  migrateGoalNotesFromAsyncStorage: jest.fn(),
  loadAllGoalNotes: jest.fn(async () => []),
  sqliteUpsertGoalNote: jest.fn(),
  sqliteDeleteGoalNote: jest.fn(),
}));

// Controllable clock so created_at differs between adds (newest-first assertions).
let mockNowMs = new Date('2026-07-15T10:00:00.000Z').getTime();
jest.mock('../../lib/appDate', () => ({
  getAppDateTime: () => new Date(mockNowMs),
}));

/* eslint-disable import/first -- jest.mock factories must precede these imports */
import {
  insertGoalNote,
  updateGoalNote,
  deleteGoalNote,
  fetchGoalNotesForUser,
} from '../../lib/db/goalNotesSupabase';
import { useGoalNotesStore } from '../../state/goalNotesSlice';
import type { GoalNote } from '../../types';
/* eslint-enable import/first */

const USER = '11111111-2222-3333-4444-555555555555';
const GOAL = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const baseNote: GoalNote = {
  id: '99999999-8888-7777-6666-555555555555',
  goal_id: GOAL,
  user_id: USER,
  local_date: '2026-07-15',
  text: 'ran 5k, felt strong',
  created_at: '2026-07-15T09:00:00.000Z',
  updated_at: '2026-07-15T09:00:00.000Z',
};

beforeEach(() => {
  mockInsert.mockClear();
  mockUpdate.mockClear();
  mockDelete.mockClear();
  mockUpdateEqCalls.length = 0;
  mockDeleteEqCalls.length = 0;
  mockSelectOrder.length = 0;
  mockQueryResult = { error: null, data: [] };
  mockNowMs = new Date('2026-07-15T10:00:00.000Z').getTime();
  useGoalNotesStore.setState({ entries: [], goalNotesCloudError: null });
});

describe('insertGoalNote — sends the client id (the entry identity)', () => {
  it('inserts every field INCLUDING the client-generated id', async () => {
    await insertGoalNote(baseNote);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    const [payload] = mockInsert.mock.calls[0] as [Record<string, unknown>];
    expect(payload).toMatchObject({
      id: baseNote.id,
      goal_id: GOAL,
      user_id: USER,
      local_date: '2026-07-15',
      text: 'ran 5k, felt strong',
    });
  });

  it('propagates insert errors to the caller', async () => {
    mockQueryResult = { error: { message: 'boom' } };
    await expect(insertGoalNote(baseNote)).rejects.toEqual({ message: 'boom' });
  });
});

describe('updateGoalNote — keyed on (id, user_id)', () => {
  it('updates by id AND user_id, never a natural key', async () => {
    await updateGoalNote({ ...baseNote, text: 'edited' });
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const [payload] = mockUpdate.mock.calls[0] as [Record<string, unknown>];
    expect(payload).toMatchObject({ text: 'edited', local_date: '2026-07-15' });
    expect(payload).not.toHaveProperty('goal_id');
    expect(mockUpdateEqCalls).toEqual([
      ['id', baseNote.id],
      ['user_id', USER],
    ]);
  });
});

describe('deleteGoalNote — keyed on (id, user_id)', () => {
  it('deletes by id AND user_id', async () => {
    await deleteGoalNote(baseNote.id, USER);
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockDeleteEqCalls).toEqual([
      ['id', baseNote.id],
      ['user_id', USER],
    ]);
  });
});

describe('fetchGoalNotesForUser — newest-first from the server', () => {
  it('orders by created_at descending', async () => {
    await fetchGoalNotesForUser(USER);
    expect(mockSelectOrder).toEqual([{ column: 'created_at', ascending: false }]);
  });
});

describe('slice add/edit/delete — multi-entry, newest-first', () => {
  it('two adds on the same day make TWO distinct rows (not one merged)', async () => {
    const store = useGoalNotesStore.getState();
    const a = await store.addGoalNote(GOAL, USER, '2026-07-15', 'entry one');
    mockNowMs += 60_000; // one minute later
    const b = await useGoalNotesStore
      .getState()
      .addGoalNote(GOAL, USER, '2026-07-15', 'entry two');

    expect(a.id).not.toBe(b.id);
    const rows = useGoalNotesStore.getState().getEntriesForGoal(GOAL);
    expect(rows).toHaveLength(2);
    // Newest-first: the later add comes first.
    expect(rows[0].id).toBe(b.id);
    expect(rows[1].id).toBe(a.id);
    // Both pushed to the cloud as INSERTs carrying their own id.
    expect(mockInsert).toHaveBeenCalledTimes(2);
    for (const [payload] of mockInsert.mock.calls) {
      expect(payload).toHaveProperty('id');
      expect(payload).toMatchObject({ goal_id: GOAL, user_id: USER });
    }
  });

  it('getEntriesForGoal isolates entries by goal', async () => {
    await useGoalNotesStore.getState().addGoalNote(GOAL, USER, '2026-07-15', 'mine');
    await useGoalNotesStore
      .getState()
      .addGoalNote('other-goal', USER, '2026-07-15', 'theirs');
    expect(useGoalNotesStore.getState().getEntriesForGoal(GOAL)).toHaveLength(1);
    expect(useGoalNotesStore.getState().getEntriesForGoal(GOAL)[0].text).toBe('mine');
  });

  it('editing an entry updates text + bumps updated_at, keeps the same id', async () => {
    const created = await useGoalNotesStore
      .getState()
      .addGoalNote(GOAL, USER, '2026-07-15', 'draft');
    mockInsert.mockClear();
    mockNowMs += 120_000;

    await useGoalNotesStore.getState().editGoalNote(created.id, USER, 'revised');
    const rows = useGoalNotesStore.getState().getEntriesForGoal(GOAL);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(created.id);
    expect(rows[0].text).toBe('revised');
    expect(new Date(rows[0].updated_at).getTime()).toBeGreaterThan(
      new Date(created.updated_at).getTime(),
    );
    // Edit pushes an UPDATE keyed by id + user_id, not an insert.
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockUpdateEqCalls).toEqual([
      ['id', created.id],
      ['user_id', USER],
    ]);
  });

  it('deleting an entry removes it and pushes a keyed remote delete', async () => {
    const created = await useGoalNotesStore
      .getState()
      .addGoalNote(GOAL, USER, '2026-07-15', 'temporary');
    mockDeleteEqCalls.length = 0;

    await useGoalNotesStore.getState().deleteGoalNote(created.id);
    await new Promise((r) => setTimeout(r, 0)); // let the fire-and-forget catch run

    expect(useGoalNotesStore.getState().getEntriesForGoal(GOAL)).toHaveLength(0);
    expect(mockDeleteEqCalls).toEqual([
      ['id', created.id],
      ['user_id', USER],
    ]);
  });

  it('deleting an unknown id is a no-op (no remote call)', async () => {
    await useGoalNotesStore.getState().deleteGoalNote('does-not-exist');
    expect(mockDelete).not.toHaveBeenCalled();
  });
});

describe('signed-out authoring never pushes to the cloud', () => {
  it("a 'local' user id keeps entries device-only", async () => {
    await useGoalNotesStore.getState().addGoalNote(GOAL, 'local', '2026-07-15', 'offline entry');
    expect(mockInsert).not.toHaveBeenCalled();
    expect(useGoalNotesStore.getState().getEntriesForGoal(GOAL)).toHaveLength(1);
  });

  it('editing then claims the entry for the signed-in user', async () => {
    const created = await useGoalNotesStore
      .getState()
      .addGoalNote(GOAL, 'local', '2026-07-15', 'offline');
    await useGoalNotesStore.getState().editGoalNote(created.id, USER, 'now online');
    const rows = useGoalNotesStore.getState().getEntriesForGoal(GOAL);
    expect(rows[0].user_id).toBe(USER);
    // Now a real uuid → the edit pushes to the cloud.
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });
});
