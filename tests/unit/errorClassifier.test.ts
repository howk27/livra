// M9 Phase 3, T3 — the error classifier and the "no raw error reaches a screen" guard.
//
// Every shape asserted below was MEASURED on this project, not imagined. The codes
// come from the sync layer's own history: 42501 from the restrictive RLS layer
// (fec1618, 2026-07-26), P0001 / FREE_COUNTER_LIMIT_REACHED from
// `enforce_free_counter_limit`, PGRST205 from probing a table that does not exist
// (2026-07-27), PGRST116 from `.single()` on nothing, 23505 from the unique index on
// `goal_mark_links`.
//
// Exhaustiveness is NOT tested here on purpose. `tsconfig.json` excludes `tests/**`,
// so a `Record<DataErrorKind, …>` in this file would constrain nothing — that is the
// exact mistake b503cfa shipped. The constraint lives in `lib/copy.ts` and
// `lib/data/errors.ts`, and deleting a member there fails `tsc`.

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  toDataError,
  asDataError,
  isDataError,
  isRetriableDataError,
  DATA_ERROR_RETRIABLE,
  type DataErrorKind,
} from '../../lib/data/errors';
import { DATA_ERROR_COPY, dataErrorCopy } from '../../lib/copy';

jest.mock('../../lib/utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), log: jest.fn(), debug: jest.fn() },
}));

/** A PostgREST error object, in the shape supabase-js actually returns. */
function pgError(fields: {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}): unknown {
  return { code: '', message: '', details: '', hint: '', ...fields };
}

describe('classification — every shape measured on this project', () => {
  const cases: [string, unknown, DataErrorKind][] = [
    [
      'RLS refusal (42501) is `permission`, NOT the free-tier cap',
      pgError({
        code: '42501',
        message:
          'new row violates row-level security policy "Free tier: max 4 marks per goal and 6 total" for table "marks"',
      }),
      'permission',
    ],
    [
      'the explicit plpgsql raise is `limit_reached`',
      pgError({ code: 'P0001', message: 'FREE_COUNTER_LIMIT_REACHED' }),
      'limit_reached',
    ],
    [
      'a bare P0001 from some other trigger is NOT a limit',
      pgError({ code: 'P0001', message: 'something else raised' }),
      'server',
    ],
    ['expired session (PGRST301) is `auth_expired`', pgError({ code: 'PGRST301' }), 'auth_expired'],
    ['401 is `auth_expired`', pgError({ code: '401' }), 'auth_expired'],
    ['missing row (PGRST116) is `not_found`', pgError({ code: 'PGRST116' }), 'not_found'],
    ['unique violation (23505) is `conflict`', pgError({ code: '23505' }), 'conflict'],
    ['missing table (PGRST205) collapses to `server`', pgError({ code: 'PGRST205' }), 'server'],
    ['foreign-key violation (23503) collapses to `server`', pgError({ code: '23503' }), 'server'],
    [
      'a fetch failure is `network`',
      Object.assign(new TypeError('Network request failed'), {}),
      'network',
    ],
    // THE SHAPE THAT ACTUALLY REACHES THIS PATH. Every write goes through
    // `const { error } = await client.from(...).insert(...)`, and supabase-js
    // DESTRUCTURES a failed fetch into a PostgrestError-shaped PLAIN OBJECT with an
    // empty `code` — it never rethrows the TypeError. The case above passes an
    // instance the write path can never produce, so it proved nothing about offline
    // behaviour. Misclassified as `unknown` this is dropped from the outbox
    // (OUTBOX_KEEP_ON_FAILURE.unknown === false) and the check-in is gone forever.
    [
      'an offline write, in the shape supabase-js DESTRUCTURES it, is `network`',
      pgError({ message: 'TypeError: Network request failed' }),
      'network',
    ],
    [
      'the web/Expo spelling of the same failure is `network`',
      pgError({ message: 'TypeError: Failed to fetch' }),
      'network',
    ],
    // The guard on the fix: a code means PostgREST ANSWERED, so it is not a
    // transport failure however the message reads.
    [
      'a coded error whose message mentions fetch is still classified by its code',
      pgError({ code: 'PGRST205', message: 'could not fetch relation' }),
      'server',
    ],
    ['an unrecognised value is `unknown`, never a guess', { weird: true }, 'unknown'],
  ];

  test.each(cases)('%s', (_label, raw, expected) => {
    expect(toDataError(raw).kind).toBe(expected);
  });

  test('auth_expired and permission are genuinely different outcomes', () => {
    // The split is the point of the classifier: one is answered by signing in and
    // the other is not, and the old single `unauthorized` kind could not say which.
    const expired = toDataError(pgError({ code: 'PGRST301' }));
    const refused = toDataError(pgError({ code: '42501' }));

    expect(expired.kind).not.toBe(refused.kind);
    expect(dataErrorCopy(expired)).not.toBe(dataErrorCopy(refused));
    expect(dataErrorCopy(expired)).toMatch(/sign in/i);
  });

  test('a refusal is never retriable — retrying one is the poison-pill shape', () => {
    expect(isRetriableDataError(toDataError(pgError({ code: '42501' })))).toBe(false);
    expect(isRetriableDataError(toDataError(pgError({ code: 'P0001', message: 'FREE_COUNTER_LIMIT_REACHED' })))).toBe(
      false,
    );
    expect(isRetriableDataError(toDataError(new TypeError('Failed to fetch')))).toBe(true);
  });
});

describe('no raw text escapes the data layer', () => {
  test('the returned message is the safe label, never the Postgres text', () => {
    const secret = 'relation "profiles" does not exist at character 15';
    const err = toDataError(pgError({ code: '42P01', message: secret, details: secret }));

    expect(err.message).not.toContain('relation');
    expect(err.message).not.toContain(secret);
    expect(isDataError(err)).toBe(true);
  });

  test('every kind has copy, and none of it is empty', () => {
    for (const kind of Object.keys(DATA_ERROR_RETRIABLE) as DataErrorKind[]) {
      expect(DATA_ERROR_COPY[kind].length).toBeGreaterThan(10);
    }
  });

  test('copy says what to do, and never apologises', () => {
    for (const line of Object.values(DATA_ERROR_COPY)) {
      expect(line).not.toMatch(/sorry|apolog|oops|something went wrong/i);
    }
  });

  test('asDataError is pure — a re-render of a failed screen must not log again', () => {
    const { logger } = jest.requireMock('../../lib/utils/logger');
    (logger.error as jest.Mock).mockClear();

    const classified = toDataError(pgError({ code: '42501' }));
    (logger.error as jest.Mock).mockClear();

    for (let i = 0; i < 50; i += 1) asDataError(classified);

    expect(logger.error).not.toHaveBeenCalled();
  });

  test('asDataError passes a DataError through and collapses anything else', () => {
    const classified = toDataError(pgError({ code: 'PGRST116' }));
    expect(asDataError(classified)).toBe(classified);
    expect(asDataError(new Error('raw'))!.kind).toBe('unknown');
    expect(asDataError(null)).toBeNull();
    expect(asDataError(undefined)).toBeNull();
  });
});

// ── GUARD: no screen renders raw error text ──────────────────────────────────
//
// Confirmed failing before being kept: restoring `marksQuery.error.message` in
// focus.tsx (what it actually shipped with in Phase 2) goes red naming the file.

const ROOT = join(__dirname, '..', '..');

const SCREENS = [
  'app/(tabs)/focus.tsx',
  'app/(tabs)/goals.tsx',
  'app/(tabs)/settings.tsx',
  'app/goal/[id].tsx',
  'app/mark/[id]/index.tsx',
  'app/goal/journal/[id].tsx',
];

/** Comment stripper that leaves string literals intact (see screenReadMigration). */
function stripComments(src: string): string {
  let out = '';
  let i = 0;
  let quote: string | null = null;
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];
    if (quote) {
      if (ch === '\\') {
        out += ch + (next ?? '');
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** `somethingError.message` / `xQuery.error.message` — a raw label headed for the UI. */
function rawErrorReads(code: string): string[] {
  const re = /\b(\w*(?:[eE]rror|Err))(?:\.error)?\s*\.\s*message\b/g;
  const hits: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) hits.push(m[0]);
  const queryRe = /\b\w*Query\s*\.\s*error\s*\.\s*message\b/g;
  while ((m = queryRe.exec(code)) !== null) hits.push(m[0]);
  return hits;
}

describe('GUARD — no raw error text reaches a screen', () => {
  test.each(SCREENS)('%s never reads .message off an error', (relPath) => {
    const code = stripComments(readFileSync(join(ROOT, relPath), 'utf8'));
    expect(rawErrorReads(code)).toEqual([]);
  });

  test('the guard is not vacuous — the Phase 2 line it was written for is caught', () => {
    const shipped = 'const error = marksQuery.error ? marksQuery.error.message : null;';
    const hits = rawErrorReads(stripComments(shipped));
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.join(' ')).toContain('marksQuery.error.message');
  });

  test('a .message inside a comment does not count', () => {
    const commented = '// const error = marksQuery.error.message;\nconst ok = 1;';
    expect(rawErrorReads(stripComments(commented))).toEqual([]);
  });
});
