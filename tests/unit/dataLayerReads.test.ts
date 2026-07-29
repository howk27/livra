// M9 Phase 1 — read-path contract tests for lib/data.
//
// The FETCHERS are pure async functions (the hooks are thin wrappers over them),
// so they are tested directly against a fake Supabase client installed via
// `setSupabaseClientOverride` — no React, no network.

import fs from 'fs';
import path from 'path';
import { setSupabaseClientOverride } from '@/lib/supabase';
import { MARK_COLUMNS } from '@/lib/data/client';
import { toDataError, isRetriableDataError, DATA_ERROR_RETRIABLE } from '@/lib/data/errors';
import { fetchGoals, fetchGoal } from '@/lib/data/goals';
import { fetchMarksForGoal, fetchMarksForUser, fetchMark, fetchMarksByGoal } from '@/lib/data/marks';
import { fetchCheckins, fetchTodayCheckins, fetchUserCheckins } from '@/lib/data/checkins';
import { fetchGoalNotes } from '@/lib/data/notes';

// The entity modules import `@/hooks/useAuth` at module scope for their hooks; the
// fetchers never call it. Stub it so importing the modules stays cheap.
// (jest.mock is hoisted above the imports by babel-jest regardless of position.)
jest.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));

type QueryResult = { data: unknown; error: unknown };

function makeBuilder(result: QueryResult) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  for (const method of ['select', 'is', 'eq', 'in', 'order', 'gte', 'lte', 'limit', 'not', 'filter']) {
    builder[method] = jest.fn(chain);
  }
  builder.maybeSingle = jest.fn(() => Promise.resolve(result));
  builder.single = jest.fn(() => Promise.resolve(result));
  // Awaiting the builder itself (chains that end at .order()) resolves the result.
  builder.then = (resolve: (v: QueryResult) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
}

/** A fake client that returns queued results in FROM-call order. */
function makeClient(results: QueryResult[]) {
  const queue = [...results];
  const fromTables: string[] = [];
  const client = {
    from: jest.fn((table: string) => {
      fromTables.push(table);
      return makeBuilder(queue.shift() ?? { data: [], error: null });
    }),
    __fromTables: fromTables,
  };
  return client;
}

function install(results: QueryResult[]) {
  const client = makeClient(results);
  setSupabaseClientOverride(client as unknown as Parameters<typeof setSupabaseClientOverride>[0]);
  return client;
}

afterEach(() => {
  setSupabaseClientOverride(null);
  jest.clearAllMocks();
});

describe('goals reads', () => {
  it('fetchGoals returns the live rows', async () => {
    const rows = [{ id: 'g1', title: 'Run a 5k' }];
    const client = install([{ data: rows, error: null }]);
    await expect(fetchGoals()).resolves.toEqual(rows);
    expect(client.__fromTables).toEqual(['goals']);
  });

  it('fetchGoal returns a single row (maybeSingle)', async () => {
    install([{ data: { id: 'g1', title: 'Run a 5k' }, error: null }]);
    await expect(fetchGoal('g1')).resolves.toEqual({ id: 'g1', title: 'Run a 5k' });
  });

  it('fetchGoal returns null when absent', async () => {
    install([{ data: null, error: null }]);
    await expect(fetchGoal('missing')).resolves.toBeNull();
  });
});

describe('marks reads resolve through goal_mark_links', () => {
  it('fetchMarksForGoal queries links FIRST, then marks by id', async () => {
    const client = install([
      { data: [{ mark_id: 'm1' }, { mark_id: 'm2' }], error: null },
      { data: [{ id: 'm1', name: 'Run' }, { id: 'm2', name: 'Stretch' }], error: null },
    ]);
    await expect(fetchMarksForGoal('g1')).resolves.toEqual([
      { id: 'm1', name: 'Run' },
      { id: 'm2', name: 'Stretch' },
    ]);
    // The link table is read before the marks table — this is the T6 fix.
    expect(client.__fromTables).toEqual(['goal_mark_links', 'marks']);
  });

  it('fetchMarksForGoal short-circuits with no links (never touches marks)', async () => {
    const client = install([{ data: [], error: null }]);
    await expect(fetchMarksForGoal('g1')).resolves.toEqual([]);
    expect(client.__fromTables).toEqual(['goal_mark_links']);
  });

  it('fetchMarksForUser reads the marks table directly', async () => {
    const client = install([{ data: [{ id: 'm1' }], error: null }]);
    await expect(fetchMarksForUser()).resolves.toEqual([{ id: 'm1' }]);
    expect(client.__fromTables).toEqual(['marks']);
  });

  it('fetchMarksByGoal groups marks by goal via links (aliased gid/mid)', async () => {
    const client = install([
      { data: [{ gid: 'g1', mid: 'm1' }, { gid: 'g1', mid: 'm2' }, { gid: 'g2', mid: 'm1' }], error: null },
      { data: [{ id: 'm1', name: 'Run' }, { id: 'm2', name: 'Stretch' }], error: null },
    ]);
    const grouped = await fetchMarksByGoal();
    expect(client.__fromTables).toEqual(['goal_mark_links', 'marks']);
    // A mark serving two goals appears under each (D-6).
    expect(grouped.g1.map((m) => m.name)).toEqual(['Run', 'Stretch']);
    expect(grouped.g2.map((m) => m.name)).toEqual(['Run']);
  });

  it('fetchMarksByGoal short-circuits with no links', async () => {
    const client = install([{ data: [], error: null }]);
    await expect(fetchMarksByGoal()).resolves.toEqual({});
    expect(client.__fromTables).toEqual(['goal_mark_links']);
  });

  it('fetchMark returns a single mark', async () => {
    install([{ data: { id: 'm1', name: 'Run' }, error: null }]);
    await expect(fetchMark('m1')).resolves.toEqual({ id: 'm1', name: 'Run' });
  });
});

describe('checkins reads mark_events', () => {
  it('fetchCheckins reads mark_events for one mark', async () => {
    const client = install([{ data: [{ id: 'e1', mark_id: 'm1' }], error: null }]);
    await expect(fetchCheckins('m1')).resolves.toEqual([{ id: 'e1', mark_id: 'm1' }]);
    expect(client.__fromTables).toEqual(['mark_events']);
  });

  it('fetchTodayCheckins reads mark_events by local date', async () => {
    const client = install([{ data: [{ id: 'e1' }], error: null }]);
    await expect(fetchTodayCheckins('2026-07-29')).resolves.toEqual([{ id: 'e1' }]);
    expect(client.__fromTables).toEqual(['mark_events']);
  });

  it('fetchUserCheckins reads every live mark_event for the user', async () => {
    const client = install([{ data: [{ id: 'e1' }, { id: 'e2' }], error: null }]);
    await expect(fetchUserCheckins()).resolves.toEqual([{ id: 'e1' }, { id: 'e2' }]);
    expect(client.__fromTables).toEqual(['mark_events']);
  });
});

describe('notes reads goal_notes', () => {
  it('fetchGoalNotes reads goal_notes for a goal', async () => {
    const client = install([{ data: [{ id: 'n1', goal_id: 'g1' }], error: null }]);
    await expect(fetchGoalNotes('g1')).resolves.toEqual([{ id: 'n1', goal_id: 'g1' }]);
    expect(client.__fromTables).toEqual(['goal_notes']);
  });
});

describe('errors never leak raw text', () => {
  it('a Postgres error becomes a typed DataError and is thrown', async () => {
    install([{ data: null, error: { code: '42501', message: 'permission denied for table marks' } }]);
    await expect(fetchGoals()).rejects.toMatchObject({ kind: 'unauthorized' });
    // The thrown value carries NO raw Postgres text.
    await install([{ data: null, error: { code: '42501', message: 'permission denied for table marks' } }]);
    try {
      await fetchGoals();
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as { message: string }).message).not.toContain('permission denied');
    }
  });

  it('classifies the seed set of failures', () => {
    expect(toDataError({ code: '42501' }).kind).toBe('unauthorized');
    expect(toDataError({ code: 'PGRST116' }).kind).toBe('not_found');
    expect(toDataError({ code: 'PGRST200' }).kind).toBe('server');
    expect(toDataError(new TypeError('Network request failed')).kind).toBe('network');
    expect(toDataError({ weird: true }).kind).toBe('unknown');
  });

  it('retriability is defined for every kind (exhaustive)', () => {
    expect(Object.keys(DATA_ERROR_RETRIABLE).sort()).toEqual(
      ['network', 'not_found', 'server', 'unauthorized', 'unknown'].sort(),
    );
    expect(isRetriableDataError({ kind: 'network', message: '' })).toBe(true);
    expect(isRetriableDataError({ kind: 'unauthorized', message: '' })).toBe(false);
  });
});

describe('GUARD: no lib/data read references marks.goal_id (T6)', () => {
  const ENTITY_MODULES = ['goals', 'marks', 'checkins', 'notes'].map((name) =>
    path.join(__dirname, '..', '..', 'lib', 'data', `${name}.ts`),
  );

  function stripComments(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  }

  it('the marks column list does not select goal_id', () => {
    expect([...MARK_COLUMNS]).not.toContain('goal_id');
  });

  it('no entity module reads .goal_id off a row (comments stripped first)', () => {
    for (const file of ENTITY_MODULES) {
      const code = stripComments(fs.readFileSync(file, 'utf8'));
      expect(code).not.toMatch(/\.goal_id\b/);
    }
  });

  it('the guard itself bites: it catches real property access but ignores comments', () => {
    // A real read of marks.goal_id would be caught…
    expect(stripComments('const g = mark.goal_id;')).toMatch(/\.goal_id\b/);
    // …while the same words inside a comment are not.
    expect(stripComments('// never read mark.goal_id here')).not.toMatch(/\.goal_id\b/);
    // The legitimate links filter `.eq('goal_id', id)` is a quoted arg, not access.
    expect(stripComments(`.eq('goal_id', goalId)`)).not.toMatch(/\.goal_id\b/);
  });
});
