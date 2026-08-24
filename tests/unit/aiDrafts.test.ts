// Erasure for saved AI goal drafts (ai_goal_packages holds the user's typed
// goal text verbatim). Founder decision 2026-08-09: build the real control
// rather than route people to a support email.

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  deleteSavedAiDrafts,
  countSavedAiDrafts,
  saveAiDraft,
  listSavedAiDrafts,
  deleteSavedAiDraft,
} from '@/lib/data/mutations/aiDrafts';
import { normalizeGoalText, type AIGoalPackage } from '@/lib/ai/goalGeneration';
import { setSupabaseClientOverride } from '@/lib/supabase';

jest.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));

const USER = '3fe1a23e-2ec2-4830-a68b-42b65fc3bcb0';
const OTHER = 'a3e8ffaf-a013-41a4-a86b-572da101a04d';

type Call = { table: string; method: string; args: unknown[] };

function makeClient(result: { data: unknown; error: unknown; count?: number }) {
  const calls: Call[] = [];
  const from = jest.fn((table: string) => {
    const builder: Record<string, unknown> = {};
    const chain =
      (method: string) =>
      (...args: unknown[]) => {
        calls.push({ table, method, args });
        return builder;
      };
    for (const m of ['select', 'delete', 'eq', 'insert', 'update', 'upsert', 'order']) {
      builder[m] = jest.fn(chain(m));
    }
    builder.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(result).then(res, rej);
    return builder;
  });
  setSupabaseClientOverride({ from } as never);
  return { calls, from };
}

afterEach(() => setSupabaseClientOverride(null as never));

describe('deleteSavedAiDrafts', () => {
  it('deletes from ai_goal_packages, scoped to the user', async () => {
    const { calls } = makeClient({ data: [{ id: 'a' }, { id: 'b' }], error: null });
    const n = await deleteSavedAiDrafts(USER);

    expect(n).toBe(2);
    expect(calls.some((c) => c.method === 'delete' && c.table === 'ai_goal_packages')).toBe(true);
    const eqs = calls.filter((c) => c.method === 'eq');
    expect(eqs).toHaveLength(1);
    expect(eqs[0].args).toEqual(['user_id', USER]);
  });

  it('reports 0 rather than throwing when there was nothing to erase', async () => {
    makeClient({ data: [], error: null });
    await expect(deleteSavedAiDrafts(USER)).resolves.toBe(0);
  });

  it('scopes by the id it was given — never a wildcard delete', async () => {
    const { calls } = makeClient({ data: [], error: null });
    await deleteSavedAiDrafts(OTHER);
    // RLS is the real boundary; this pins that the statement never goes
    // unfiltered, which is what would make a bug catastrophic instead of refused.
    expect(calls.filter((c) => c.method === 'eq')[0].args).toEqual(['user_id', OTHER]);
  });

  it('surfaces a refusal as a DataError instead of swallowing it', async () => {
    makeClient({ data: null, error: { code: '42501', message: 'denied' } });
    await expect(deleteSavedAiDrafts(USER)).rejects.toMatchObject({ kind: 'permission' });
  });
});

describe('countSavedAiDrafts', () => {
  it('counts without fetching the rows', async () => {
    const { calls } = makeClient({ data: null, error: null, count: 3 });
    await expect(countSavedAiDrafts(USER)).resolves.toBe(3);
    const select = calls.find((c) => c.method === 'select');
    expect(select?.args[1]).toMatchObject({ head: true, count: 'exact' });
  });

  it('treats a null count as 0', async () => {
    makeClient({ data: null, error: null });
    await expect(countSavedAiDrafts(USER)).resolves.toBe(0);
  });
});

// A minimally valid package for the drafts round-trip (validator repairs the
// icon to the fallback; that is fine — the fixture only has to survive).
const PKG: AIGoalPackage = {
  goalTitle: 'Run a marathon',
  timeframeWeeks: 12,
  confidence: 'high',
  marks: [{ name: 'Run', icon: 'run', frequency: 3, why: 'Base mileage builds the engine.' }],
};

describe('saveAiDraft (2026-08-24, real drafts)', () => {
  it('upserts confirmed=false and NEVER updates on conflict — a confirmed cache row must not become a phantom draft', async () => {
    const { calls } = makeClient({ data: null, error: null });
    await saveAiDraft(USER, 'Run a marathon', PKG);

    const upsert = calls.find((c) => c.method === 'upsert');
    expect(upsert?.table).toBe('ai_goal_packages');
    expect(upsert?.args[0]).toMatchObject({
      user_id: USER,
      goal_text: 'Run a marathon',
      goal_text_normalized: normalizeGoalText('Run a marathon'),
      confirmed: false,
    });
    expect(upsert?.args[1]).toMatchObject({
      onConflict: 'goal_text_normalized,user_id',
      ignoreDuplicates: true,
    });
  });

  it('is a no-op for text that normalizes to nothing', async () => {
    const { calls } = makeClient({ data: null, error: null });
    await saveAiDraft(USER, '!!!', PKG);
    expect(calls).toHaveLength(0);
  });

  it('surfaces a refusal as a DataError', async () => {
    makeClient({ data: null, error: { code: '42501', message: 'denied' } });
    await expect(saveAiDraft(USER, 'Run a marathon', PKG)).rejects.toMatchObject({
      kind: 'permission',
    });
  });
});

describe('listSavedAiDrafts', () => {
  it('reads only unconfirmed rows for the user and validates each package', async () => {
    const { calls } = makeClient({
      data: [
        {
          id: 'd1',
          goal_text: 'Run a marathon',
          created_at: '2026-08-20T12:00:00Z',
          package_json: PKG,
        },
        // An unsalvageable package must be DROPPED, not rendered.
        { id: 'd2', goal_text: 'Bad row', created_at: '2026-08-19T12:00:00Z', package_json: {} },
      ],
      error: null,
    });
    const drafts = await listSavedAiDrafts(USER);

    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ id: 'd1', goalText: 'Run a marathon' });
    expect(drafts[0].pkg.goalTitle).toBe('Run a marathon');

    const eqs = calls.filter((c) => c.method === 'eq').map((c) => c.args);
    expect(eqs).toContainEqual(['user_id', USER]);
    expect(eqs).toContainEqual(['confirmed', false]);
  });

  it('returns empty for no rows', async () => {
    makeClient({ data: [], error: null });
    await expect(listSavedAiDrafts(USER)).resolves.toEqual([]);
  });
});

describe('deleteSavedAiDraft (single row)', () => {
  it('scopes by BOTH the draft id and the user id', async () => {
    const { calls } = makeClient({ data: null, error: null });
    await deleteSavedAiDraft(USER, 'd1');

    expect(calls.some((c) => c.method === 'delete' && c.table === 'ai_goal_packages')).toBe(true);
    const eqs = calls.filter((c) => c.method === 'eq').map((c) => c.args);
    expect(eqs).toContainEqual(['id', 'd1']);
    expect(eqs).toContainEqual(['user_id', USER]);
  });

  it('surfaces a refusal as a DataError', async () => {
    makeClient({ data: null, error: { code: '42501', message: 'denied' } });
    await expect(deleteSavedAiDraft(USER, 'd1')).rejects.toMatchObject({ kind: 'permission' });
  });
});

describe('GUARD: the D-8 hard-delete exception stays exactly one call', () => {
  // D-8 forbids hard deletes and every other mutation tombstones via deleted_at.
  // This module is the deliberate exception, because a tombstone would leave
  // goal_text in the row and make the privacy policy's deletion sentence untrue.
  // If a second .delete() ever appears in the mutations directory, that is the
  // one to question — so this fails when the exception spreads.
  const MUTATIONS = join(__dirname, '..', '..', 'lib', 'data', 'mutations');

  it('ai_goal_packages is the only table any mutation hard-deletes', () => {
    const files = require('fs').readdirSync(MUTATIONS) as string[];
    const offenders: string[] = [];
    for (const f of files.filter((n) => n.endsWith('.ts'))) {
      const src = readFileSync(join(MUTATIONS, f), 'utf8')
        // Strip comments — this repo has three times shipped a source scan that
        // matched prose instead of code.
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      if (/\.delete\s*\(/.test(src) && f !== 'aiDrafts.ts') offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });

  it('the scan is non-vacuous — it finds an injected .delete()', () => {
    const src = 'const x = client.from("goals").delete().eq("id", id);';
    expect(/\.delete\s*\(/.test(src)).toBe(true);
  });
});
