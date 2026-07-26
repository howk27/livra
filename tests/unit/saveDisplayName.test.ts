import { saveDisplayName } from '../../lib/profile/saveDisplayName';

/**
 * Regression guard for the name that could never be saved (device report
 * 2026-07-25, root-caused live the same day).
 *
 * The screen used `.upsert({ id, display_name })`. PostgREST compiles an upsert
 * into INSERT ... ON CONFLICT (id) DO UPDATE SET id = excluded.id,
 * display_name = excluded.display_name — every payload column lands in the SET
 * list, the primary key included. `authenticated` holds column-level UPDATE on
 * profiles for avatar_url, display_name, full_name and onboarding_completed
 * ONLY, so `SET id = ...` is a privilege it does not have and Postgres answers
 * 42501 permission denied. Proven against production by running all three
 * statement shapes as the `authenticated` role inside a rolled-back
 * transaction: the app's shape failed, the same upsert without id in the SET
 * succeeded, and a plain UPDATE succeeded.
 *
 * The fix is therefore about the STATEMENT SHAPE, not about the payload: never
 * send the primary key in a write whose SET list the server will widen.
 */

type Row = { id: string };

function makeClient(opts: {
  updateResult?: { data: Row[] | null; error: unknown };
  insertResult?: { error: unknown };
}) {
  const calls: { op: string; payload?: unknown; eq?: [string, string] }[] = [];
  const updateResult = opts.updateResult ?? { data: [{ id: 'u1' }], error: null };
  const insertResult = opts.insertResult ?? { error: null };

  const client = {
    from(table: string) {
      calls.push({ op: `from:${table}` });
      return {
        update(payload: unknown) {
          calls.push({ op: 'update', payload });
          return {
            eq(column: string, value: string) {
              calls.push({ op: 'eq', eq: [column, value] });
              return {
                select() {
                  calls.push({ op: 'select' });
                  return Promise.resolve(updateResult);
                },
              };
            },
          };
        },
        insert(payload: unknown) {
          calls.push({ op: 'insert', payload });
          return Promise.resolve(insertResult);
        },
        upsert(payload: unknown) {
          calls.push({ op: 'upsert', payload });
          return Promise.resolve({ error: null });
        },
      };
    },
  };

  return { client, calls };
}

describe('saveDisplayName', () => {
  it('NEVER uses upsert — that shape is denied 42501 by the live grants', async () => {
    const { client, calls } = makeClient({});
    await saveDisplayName(client as never, 'u1', 'Deivi');
    expect(calls.some(c => c.op === 'upsert')).toBe(false);
  });

  it('updates display_name by id, and never sends the primary key in the payload', async () => {
    const { client, calls } = makeClient({});
    const result = await saveDisplayName(client as never, 'u1', 'Deivi');

    expect(result.ok).toBe(true);
    const update = calls.find(c => c.op === 'update');
    expect(update?.payload).toEqual({ display_name: 'Deivi' });
    expect(Object.keys(update?.payload as object)).not.toContain('id');
    expect(calls.find(c => c.op === 'eq')?.eq).toEqual(['id', 'u1']);
  });

  it('reports the error when the update is rejected', async () => {
    const { client } = makeClient({
      updateResult: { data: null, error: { message: 'permission denied for table profiles' } },
    });
    const result = await saveDisplayName(client as never, 'u1', 'Deivi');
    expect(result.ok).toBe(false);
  });

  it('falls back to insert when no profile row matched, so the save is never a silent no-op', async () => {
    const { client, calls } = makeClient({ updateResult: { data: [], error: null } });
    const result = await saveDisplayName(client as never, 'u1', 'Deivi');

    expect(result.ok).toBe(true);
    const insert = calls.find(c => c.op === 'insert');
    expect(insert?.payload).toEqual({ id: 'u1', display_name: 'Deivi' });
  });

  it('reports the error when the fallback insert also fails', async () => {
    const { client } = makeClient({
      updateResult: { data: [], error: null },
      insertResult: { error: { message: 'row level security' } },
    });
    const result = await saveDisplayName(client as never, 'u1', 'Deivi');
    expect(result.ok).toBe(false);
  });
});
