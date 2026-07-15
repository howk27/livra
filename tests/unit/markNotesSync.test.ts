/**
 * QC2-E — mark-notes upsert "duplicate key violates unique constraint".
 *
 * Contract under test:
 *  1. The Supabase upsert NEVER sends a client `id` — ON CONFLICT only
 *     arbitrates on (mark_id, date, user_id); a client-supplied id that
 *     diverged from the server's raises 23505 on mark_notes_pkey.
 *  2. Remote deletes are keyed on the natural key (user_id, mark_id, date),
 *     not the client id.
 *  3. Re-saving the same (mark, date) reuses the existing row identity —
 *     no second row, no new uuid — including after a failed (offline/pending)
 *     cloud push, so retries can never mint a duplicate.
 */

const mockUpsert = jest.fn();
const mockDeleteEqCalls: [string, string][] = [];
const mockDelete = jest.fn();

function mockMakeQuery(result: { error: unknown }) {
  const q: any = {
    upsert: (...args: unknown[]) => {
      mockUpsert(...args);
      return Promise.resolve(result);
    },
    delete: (...args: unknown[]) => {
      mockDelete(...args);
      return q;
    },
    eq: (col: string, val: string) => {
      mockDeleteEqCalls.push([col, val]);
      return q;
    },
    then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
  };
  return q;
}

let mockQueryResult: { error: unknown } = { error: null };

jest.mock('../../lib/supabase', () => ({
  getSupabaseClient: () => ({
    from: (table: string) => {
      expect(table).toBe('mark_notes');
      return mockMakeQuery(mockQueryResult);
    },
    auth: { getUser: async () => ({ data: { user: null } }) },
  }),
}));

// Route the slice through the AsyncStorage path (no SQLite) for determinism.
jest.mock('../../lib/db/markNotesSqlite', () => ({
  markNotesSqliteSupported: () => false,
  migrateMarkNotesFromAsyncStorage: jest.fn(),
  loadAllMarkNotes: jest.fn(async () => []),
  sqliteUpsertMarkNote: jest.fn(),
  sqliteDeleteMarkNote: jest.fn(),
  sqliteDeleteNotesForMark: jest.fn(),
}));

jest.mock('../../lib/appDate', () => ({
  getAppDateTime: () => new Date('2026-07-14T10:00:00.000Z'),
}));

/* eslint-disable import/first -- jest.mock factories must precede these imports */
import { supabaseUpsertNote, supabaseDeleteNote } from '../../lib/db/markNotesSupabase';
import { useDailyTrackingStore } from '../../state/dailyTrackingSlice';
import type { MarkNote } from '../../types';
/* eslint-enable import/first */

const USER = '11111111-2222-3333-4444-555555555555';
const MARK = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const baseNote: MarkNote = {
  id: '99999999-8888-7777-6666-555555555555',
  mark_id: MARK,
  user_id: USER,
  date: '2026-07-14',
  text: 'felt strong today',
  created_at: '2026-07-14T09:00:00.000Z',
  updated_at: '2026-07-14T09:00:00.000Z',
};

beforeEach(() => {
  mockUpsert.mockClear();
  mockDelete.mockClear();
  mockDeleteEqCalls.length = 0;
  mockQueryResult = { error: null };
  useDailyTrackingStore.setState({ dailyLogs: [], notesCloudError: null });
});

describe('supabaseUpsertNote — stable row identity, no client id', () => {
  it('sends the natural key + content but NEVER the client id', async () => {
    await supabaseUpsertNote(baseNote);
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const [payload, options] = mockUpsert.mock.calls[0] as [Record<string, unknown>, { onConflict: string }];
    expect(payload).not.toHaveProperty('id');
    expect(payload).toMatchObject({
      mark_id: MARK,
      user_id: USER,
      date: '2026-07-14',
      text: 'felt strong today',
    });
    expect(options.onConflict).toBe('mark_id,date,user_id');
  });

  it('onConflict column set matches the UNIQUE (mark_id, date, user_id) constraint', async () => {
    await supabaseUpsertNote(baseNote);
    const [, options] = mockUpsert.mock.calls[0] as [unknown, { onConflict: string }];
    expect(options.onConflict.split(',').sort()).toEqual(['date', 'mark_id', 'user_id']);
  });

  it('propagates upsert errors to the caller', async () => {
    mockQueryResult = { error: { message: 'boom' } };
    await expect(supabaseUpsertNote(baseNote)).rejects.toEqual({ message: 'boom' });
  });
});

describe('supabaseDeleteNote — keyed on the natural key, not the client id', () => {
  it('filters by user_id, mark_id and date', async () => {
    await supabaseDeleteNote(baseNote);
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockDeleteEqCalls).toEqual([
      ['user_id', USER],
      ['mark_id', MARK],
      ['date', '2026-07-14'],
    ]);
    expect(mockDeleteEqCalls.map(([col]) => col)).not.toContain('id');
  });
});

describe('upsertDailyLogNote — one identity per (mark, date)', () => {
  it('re-saving the same mark/date reuses the row (same id, no second row)', async () => {
    const store = useDailyTrackingStore.getState();
    const first = await store.upsertDailyLogNote(MARK, USER, '2026-07-14', 'v1');
    const second = await useDailyTrackingStore
      .getState()
      .upsertDailyLogNote(MARK, USER, '2026-07-14', 'v2');

    expect(second.id).toBe(first.id);
    const logs = useDailyTrackingStore.getState().dailyLogs;
    expect(logs).toHaveLength(1);
    expect(logs[0].text).toBe('v2');
    // Both cloud pushes carried the same identity and no client id in payload.
    expect(mockUpsert).toHaveBeenCalledTimes(2);
    for (const [payload] of mockUpsert.mock.calls) {
      expect(payload).not.toHaveProperty('id');
      expect(payload).toMatchObject({ mark_id: MARK, user_id: USER, date: '2026-07-14' });
    }
  });

  it('editing a note created signed-out claims it for the current user', async () => {
    await useDailyTrackingStore.getState().upsertDailyLogNote(MARK, 'local', '2026-07-14', 'offline note');
    expect(mockUpsert).not.toHaveBeenCalled(); // 'local' never pushes

    const note = await useDailyTrackingStore
      .getState()
      .upsertDailyLogNote(MARK, USER, '2026-07-14', 'now signed in');
    expect(note.user_id).toBe(USER);
    expect(useDailyTrackingStore.getState().dailyLogs).toHaveLength(1);
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const [payload] = mockUpsert.mock.calls[0] as [Record<string, unknown>];
    expect(payload.user_id).toBe(USER); // never pushes a non-UUID user_id
  });

  it('offline/pending sync: failed push sets the cloud hint, retry does not duplicate', async () => {
    mockQueryResult = { error: { message: 'network down' } };
    const first = await useDailyTrackingStore
      .getState()
      .upsertDailyLogNote(MARK, USER, '2026-07-14', 'v1');
    await new Promise((r) => setTimeout(r, 0)); // let the fire-and-forget catch run
    expect(useDailyTrackingStore.getState().notesCloudError).toMatch(/Cloud backup failed/);

    // Back online: the retry save reuses the SAME identity — no new uuid,
    // so the composite upsert can never race the pkey into a duplicate.
    mockQueryResult = { error: null };
    const retry = await useDailyTrackingStore
      .getState()
      .upsertDailyLogNote(MARK, USER, '2026-07-14', 'v1 retried');
    await new Promise((r) => setTimeout(r, 0));

    expect(retry.id).toBe(first.id);
    expect(useDailyTrackingStore.getState().dailyLogs).toHaveLength(1);
    expect(useDailyTrackingStore.getState().notesCloudError).toBeNull();
  });
});

describe('deleteDailyLogNote — remote delete by natural key', () => {
  it('passes the deleted note composite to supabaseDeleteNote', async () => {
    const note = await useDailyTrackingStore
      .getState()
      .upsertDailyLogNote(MARK, USER, '2026-07-14', 'to be removed');
    mockUpsert.mockClear();
    mockDeleteEqCalls.length = 0;

    await useDailyTrackingStore.getState().deleteDailyLogNote(note.id);
    await new Promise((r) => setTimeout(r, 0));

    expect(useDailyTrackingStore.getState().dailyLogs).toHaveLength(0);
    expect(mockDeleteEqCalls).toEqual([
      ['user_id', USER],
      ['mark_id', MARK],
      ['date', '2026-07-14'],
    ]);
  });

  it('is a no-op for an unknown id (no remote call)', async () => {
    await useDailyTrackingStore.getState().deleteDailyLogNote('does-not-exist');
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
