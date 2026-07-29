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
  | 'unauthorized' // no session, 401/403, or RLS refusal (Postgres 42501)
  | 'not_found' // an expected single row was absent
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
  unauthorized: false,
  not_found: false,
  server: true,
  unknown: false,
};

/** Safe default messages. Not user copy (Phase 3 owns that) — just a legible label. */
const SAFE_MESSAGE: Record<DataErrorKind, string> = {
  network: 'The device is offline or the request could not reach the server.',
  unauthorized: 'The request was not permitted for the current session.',
  not_found: 'The requested record was not found.',
  server: 'The server rejected the request.',
  unknown: 'An unexpected error occurred while reading data.',
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

function isNetworkFailure(raw: unknown): boolean {
  const name = errorName(raw);
  if (name === 'AuthRetryableFetchError' || name === 'FunctionsFetchError') return true;
  const msg = errorMessage(raw).toLowerCase();
  return (
    raw instanceof TypeError &&
    (msg.includes('network request failed') || msg.includes('failed to fetch') || msg.includes('fetch'))
  );
}

function classify(raw: unknown): DataErrorKind {
  if (isNetworkFailure(raw)) return 'network';

  const code = errorCode(raw);
  if (code) {
    // Postgres permission denied (RLS) and PostgREST auth failures.
    if (code === '42501' || code === 'PGRST301' || code === '401') return 'unauthorized';
    // PostgREST "no rows" from `.single()`.
    if (code === 'PGRST116') return 'not_found';
    // Any other PostgREST error, or a 5-char SQLSTATE, is a real server error.
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
  logger.error('[data] read failed', {
    kind,
    name: errorName(raw) || undefined,
    code: errorCode(raw) || undefined,
    messageLength: errorMessage(raw).length,
  });
  return { kind, message: SAFE_MESSAGE[kind] };
}
