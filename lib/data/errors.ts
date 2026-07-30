// lib/data/errors.ts
//
// M9 Phase 1 — the error SEAM for the read path. Phase 3 owns the full classifier
// and its user-facing copy map; Phase 1 builds only enough that no read path ever
// leaks raw Postgres text in the meantime (Spec §6).
//
// Rule: a raw error NEVER leaves the data layer. `toDataError` maps anything to a
// small typed union and sends the raw text to the logger ONLY.

import { logger } from '@/lib/utils/logger';

/**
 * The fixed set of read-path failure outcomes. Deliberately small — Phase 3 may
 * add copy and retry nuance, but a new *kind* is a real classification decision,
 * so adding one must force a compile error at every place that maps over kinds
 * (see DATA_ERROR_RETRIABLE below).
 */
export type DataErrorKind =
  | 'network' // request never reached the server (offline / fetch failure)
  | 'auth_expired' // the SESSION is gone — 401 / PGRST301. Answered by signing in.
  | 'permission' // the server REFUSED a permitted-looking request — Postgres 42501.
  | 'limit_reached' // an explicit free-tier raise — P0001 / FREE_COUNTER_LIMIT_REACHED
  | 'not_found' // an expected single row was absent
  | 'conflict' // unique violation (23505) — the row is already there
  | 'server' // PostgREST/Postgres returned an error that is none of the above
  | 'unknown'; // unclassified — the honest default, never a guess

export interface DataError {
  readonly kind: DataErrorKind;
  /**
   * A safe, non-sensitive message fit for logs/telemetry and (in Phase 3) copy
   * lookup. NEVER contains raw Postgres detail — that goes to the logger only.
   */
  readonly message: string;
}

/**
 * Whether a failure of this kind is worth an automatic retry.
 *
 * This map is ALSO the exhaustiveness guard. It lives in this shipped module on
 * purpose: `tsconfig.json` excludes `tests/**`, so a `Record<Union, …>` written
 * in a test file is never read by `tsc` — this repo shipped exactly that mistake
 * and two new enum values sailed past it. A new `DataErrorKind` that is not
 * classified here is a `tsc` error right here.
 */
export const DATA_ERROR_RETRIABLE: Record<DataErrorKind, boolean> = {
  network: true,
  auth_expired: false,
  // A refusal repeats identically until something changes server-side. Retrying it
  // is the poison-pill shape this project already paid for once (2026-07-26).
  permission: false,
  limit_reached: false,
  not_found: false,
  // The row is already there — a retry would refuse again, and it is not a failure
  // worth chasing.
  conflict: false,
  server: true,
  unknown: false,
};

/**
 * Safe LOG labels — not user copy. User copy is `DATA_ERROR_COPY` in `lib/copy.ts`
 * (one exhaustive record per concern, both in shipped modules `tsc` reads).
 */
const SAFE_MESSAGE: Record<DataErrorKind, string> = {
  network: 'The device is offline or the request could not reach the server.',
  auth_expired: 'The session is missing or expired.',
  permission: 'The server refused the request (RLS or grant).',
  limit_reached: 'A free-tier limit refused the write.',
  not_found: 'The requested record was not found.',
  conflict: 'A row with that identity already exists.',
  server: 'The server rejected the request.',
  unknown: 'An unexpected error occurred.',
};

export function isDataError(value: unknown): value is DataError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    'message' in value &&
    typeof (value as DataError).message === 'string' &&
    (value as DataError).kind in DATA_ERROR_RETRIABLE
  );
}

export function isRetriableDataError(error: DataError): boolean {
  return DATA_ERROR_RETRIABLE[error.kind];
}

/**
 * Narrow a React Query `error` (typed `Error`, actually a `DataError` because every
 * `queryFn` throws through `toDataError`) for copy lookup.
 *
 * PURE — it never logs. `toDataError` is the classify-and-log entry point and runs
 * once, where the failure happens; this runs on every render of a failed screen, so
 * logging here would write the same line hundreds of times.
 */
export function asDataError(raw: unknown): DataError | null {
  if (raw === null || raw === undefined) return null;
  if (isDataError(raw)) return raw;
  return { kind: 'unknown', message: SAFE_MESSAGE.unknown };
}

/** Postgres/PostgREST error code, if the raw value carries one. */
function errorCode(raw: unknown): string | null {
  if (typeof raw === 'object' && raw !== null && 'code' in raw) {
    const code = (raw as { code: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return null;
}

function errorName(raw: unknown): string {
  return raw instanceof Error ? raw.name : '';
}

function errorMessage(raw: unknown): string {
  if (raw instanceof Error) return raw.message;
  if (typeof raw === 'object' && raw !== null && 'message' in raw) {
    const m = (raw as { message: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return String(raw);
}

/** PostgREST puts the plpgsql message in `message` and the rest in `details`/`hint`. */
function errorDetail(raw: unknown): string {
  if (typeof raw !== 'object' || raw === null) return '';
  const parts: string[] = [];
  for (const field of ['details', 'hint'] as const) {
    if (field in raw) {
      const v = (raw as Record<string, unknown>)[field];
      if (typeof v === 'string') parts.push(v);
    }
  }
  return parts.join(' ');
}

function isNetworkFailure(raw: unknown): boolean {
  const name = errorName(raw);
  if (name === 'AuthRetryableFetchError' || name === 'FunctionsFetchError') return true;
  const msg = errorMessage(raw).toLowerCase();
  return (
    raw instanceof TypeError &&
    (msg.includes('network request failed') || msg.includes('failed to fetch') || msg.includes('fetch'))
  );
}

/**
 * The explicit free-tier raise, as `enforce_free_counter_limit` emits it. Postgres
 * gives every `RAISE EXCEPTION` without an explicit SQLSTATE the code `P0001`, so
 * the code alone says only "a trigger raised"; the sentinel in the message is what
 * identifies WHICH one. Both must match — a bare `P0001` is a `server` error.
 */
function isFreeTierRaise(raw: unknown): boolean {
  if (errorCode(raw) !== 'P0001') return false;
  const text = `${errorMessage(raw)} ${errorDetail(raw)}`;
  return /FREE_COUNTER_LIMIT_REACHED/i.test(text) || /free tier/i.test(text);
}

function classify(raw: unknown): DataErrorKind {
  if (isNetworkFailure(raw)) return 'network';
  if (isFreeTierRaise(raw)) return 'limit_reached';

  const code = errorCode(raw);
  if (code) {
    // The SESSION is gone. Distinct from 42501 below, and the distinction is the
    // whole point: this one is answered by signing in, that one is not.
    if (code === 'PGRST301' || code === '401') return 'auth_expired';
    // Postgres "permission denied" — a policy or grant refused a request that the
    // client had every reason to believe was allowed.
    //
    // 42501 IS NOT EXCLUSIVELY THE FREE-TIER CAP. That judgement is recorded in
    // fec1618 and stands: the restrictive RLS layer raises it, and so would a real
    // permission bug. Copy for this kind must not claim to know which.
    if (code === '42501') return 'permission';
    // PostgREST "no rows" from `.single()`.
    if (code === 'PGRST116') return 'not_found';
    // Unique violation — for our writes (client-generated uuids) this means the row
    // is already there, which is usually a replay, not a failure.
    if (code === '23505') return 'conflict';
    // Any other PostgREST error, or a 5-char SQLSTATE, is a real server error. This
    // deliberately absorbs PGRST205 (table missing — a schema/deploy skew the user
    // cannot act on) and 23503 (foreign key / parent-missing).
    if (/^PGRST/.test(code) || /^[0-9A-Z]{5}$/.test(code)) return 'server';
  }
  return 'unknown';
}

/**
 * Map any thrown/returned value into a typed DataError. The raw text — which may
 * carry Postgres detail — is logged and NEVER placed on the returned object.
 */
export function toDataError(raw: unknown): DataError {
  if (isDataError(raw)) return raw;
  const kind = classify(raw);
  logger.error('[data] request failed', {
    kind,
    name: errorName(raw) || undefined,
    code: errorCode(raw) || undefined,
    messageLength: errorMessage(raw).length,
  });
  return { kind, message: SAFE_MESSAGE[kind] };
}
