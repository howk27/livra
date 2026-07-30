// lib/data/mutations/checkins.ts
//
// M9 Phase 3 Task 2 — THE CHECK-IN WRITE. The app's hottest path, and the first
// mutation in `lib/data/`.
//
// ONE ROW PER TAP. The retired path (`hooks/useCounters.ts` `incrementMark`, ~237
// lines) wrote TWO values — a `mark_events` row AND `marks.total` — then needed
// `lib/db/markTotalReconciliation.ts` to keep them in step and a hand-rolled
// `recentUpdates` map to stop a concurrent load from clobbering the guess. Under
// derived totals (Phase 4) there is no second value to drift from the first, so
// this module writes exactly one row and NEVER touches `marks.total`.
//
// IDEMPOTENCY IS STRUCTURAL, NOT DEFENSIVE. The primary key is generated on the
// client before the request leaves, so the same check-in sent twice is one INSERT
// and one 23505 conflict — never two rows. Phase 4's outbox flush depends on that
// property; it is established here, before the outbox exists to need it.
//
// OPTIMISTIC UPDATES ARE REACT QUERY'S. `onMutate` patches the cache and `onError`
// undoes it. That is the whole of what `recentUpdates` was hand-rolling.
//
// ARCHIVE, NEVER HARD-DELETE (D-8): undo stamps `deleted_at`; no mutation here
// issues a DELETE.

import 'react-native-get-random-values'; // must precede any uuid use (see app/_layout.tsx)
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { v4 as uuidv4 } from 'uuid';
import { dataClient, MARK_EVENT_COLUMNS, selectList } from '@/lib/data/client';
import { queryKeys } from '@/lib/data/queryKeys';
import { toDataError, type DataError } from '@/lib/data/errors';
import { formatDate } from '@/lib/date';
import { getAppDateTime, isDebugAppDateActive } from '@/lib/appDate';
import { logger } from '@/lib/utils/logger';
import type { MarkEventRow } from '@/lib/data/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Clock drift tolerated before a timestamp reads as manipulated, in minutes. */
const FUTURE_TOLERANCE_MINUTES = 5;

/** A single tap can only ever be a handful of reps; anything larger is a bug or an
 * attempt to inflate history in one request. */
const MAX_AMOUNT_PER_WRITE = 100;

export interface LogCheckinInput {
  markId: string;
  /** The signed-in user. RLS is the real authority — a mismatched id is refused
   * server-side with 42501, so this value cannot be used to write someone else's
   * row. It is here because every call site already holds it. */
  userId: string;
  /** Reps recorded by this tap. Whole and positive; the UI only ever sends 1. */
  amount?: number;
}

/**
 * INPUT VALIDATION AT THE BOUNDARY (security floor). Everything a screen hands the
 * write path is checked HERE, once, before a request is built — not deep inside
 * PostgREST and not on the way back out as a raw error.
 *
 * PURE and synchronous, so `onMutate` and the insert use the SAME row: the id
 * generated here is the id that lands in the cache and in Postgres.
 */
export function buildCheckinRow(
  input: LogCheckinInput,
  now: Date = getAppDateTime(),
): MarkEventRow {
  const { markId, userId, amount = 1 } = input;

  if (!UUID_RE.test(userId)) throw invalid('userId is not a uuid');
  if (!UUID_RE.test(markId)) throw invalid('markId is not a uuid');
  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_AMOUNT_PER_WRITE) {
    throw invalid('amount is not a whole count within range');
  }

  // Timestamp sanity, carried over from the retired `incrementMark`. It is not a
  // security control — the server does not check `occurred_at` — but a device
  // clock years out of step would otherwise write history that no streak, week or
  // progress calculation can make sense of. Skipped when the dev date override is
  // on, which is the only legitimate way `now` is not the real clock.
  if (!isDebugAppDateActive()) {
    const ceiling = new Date();
    ceiling.setMinutes(ceiling.getMinutes() + FUTURE_TOLERANCE_MINUTES);
    if (now.getTime() > ceiling.getTime()) throw invalid('timestamp is in the future');

    const floor = new Date();
    floor.setFullYear(floor.getFullYear() - 1);
    if (now.getTime() < floor.getTime()) throw invalid('timestamp is more than a year old');
  }

  const stamp = now.toISOString();
  return {
    id: uuidv4(),
    user_id: userId,
    mark_id: markId,
    event_type: 'increment',
    amount,
    occurred_at: stamp,
    // Must match `todayLocalDate()` in lib/data/checkins.ts — reads filter on this
    // column, so a write that formats it differently is invisible to today's count.
    occurred_local_date: formatDate(now),
    meta: null,
    // Stamped by the client, not left to the server default: Phase 4 flushes a
    // queued check-in minutes or hours later, and it must not then claim to have
    // been created at flush time.
    created_at: stamp,
    updated_at: stamp,
    deleted_at: null,
  };
}

/** A rejected input is a `DataError` like any other failure — a raw `Error` here
 * would be the exact leak Task 1 closed. `unknown` is the honest kind: it is not
 * a server refusal, and its copy ("That didn't go through. Try again.") is right. */
function invalid(reason: string): DataError {
  logger.error('[data] check-in rejected before send', { reason });
  return { kind: 'unknown', message: 'The check-in could not be built from that input.' };
}

/** The single INSERT. Returns the SERVER's row so the optimistic guess is replaced
 * by the stored truth (defaults, triggers, any normalisation). */
export async function insertCheckin(row: MarkEventRow): Promise<MarkEventRow> {
  const { data, error } = await dataClient()
    .from('mark_events')
    .insert(row)
    .select(selectList(MARK_EVENT_COLUMNS))
    .single();
  if (error) throw toDataError(error);
  // No representation returned is not a failure — we know exactly what we sent.
  return (data ?? row) as unknown as MarkEventRow;
}

/** Undo: tombstone the row (D-8). Reads filter `deleted_at is null`, so this is
 * what removes a check-in from every count without destroying the record. */
export async function softDeleteCheckin(
  eventId: string,
  now: Date = getAppDateTime(),
): Promise<void> {
  if (!UUID_RE.test(eventId)) throw invalid('eventId is not a uuid');
  const stamp = now.toISOString();
  const { error } = await dataClient()
    .from('mark_events')
    .update({ deleted_at: stamp, updated_at: stamp })
    .eq('id', eventId);
  if (error) throw toDataError(error);
}

// ─── Cache patching ─────────────────────────────────────────────────────────
//
// Three keys hold check-ins and all three must agree, or the same tap reads as
// logged on one screen and not on another. `lib/data/bridge.ts` delegates to these
// so there is ONE implementation while both write paths are alive; when Task 6
// deletes the bridge, the primitives stay here where they belong.

/** Prepend newest-first, replacing any entry with the same id. Idempotent by
 * construction: the eventual refetch carrying the real row cannot double it. */
export function upsertCheckinRow(
  existing: MarkEventRow[] | undefined,
  row: MarkEventRow,
): MarkEventRow[] | undefined {
  if (existing === undefined) return existing; // patch only what a screen has fetched
  return [row, ...existing.filter((e) => e.id !== row.id)];
}

export function removeCheckinRow(
  existing: MarkEventRow[] | undefined,
  eventId: string,
): MarkEventRow[] | undefined {
  if (existing === undefined) return existing;
  return existing.filter((e) => e.id !== eventId);
}

/** The three keys a single check-in appears in. */
function checkinKeys(userId: string, markId: string, localDate: string) {
  return [
    queryKeys.checkins(userId, markId),
    queryKeys.userCheckins(userId),
    queryKeys.todayCheckins(userId, localDate),
  ] as const;
}

export function applyCheckinToCaches(client: QueryClient, row: MarkEventRow): void {
  for (const key of checkinKeys(row.user_id, row.mark_id, row.occurred_local_date)) {
    client.setQueryData<MarkEventRow[]>(key, (old) => upsertCheckinRow(old, row));
  }
}

export function removeCheckinFromCaches(
  client: QueryClient,
  params: { userId: string; markId: string; eventId: string; localDate: string },
): void {
  const { userId, markId, eventId, localDate } = params;
  for (const key of checkinKeys(userId, markId, localDate)) {
    client.setQueryData<MarkEventRow[]>(key, (old) => removeCheckinRow(old, eventId));
  }
}

// ─── Mutations ──────────────────────────────────────────────────────────────
//
// Neither mutation invalidates on success. The cache already holds the row the
// server confirmed, and a blanket invalidation would refetch the world on every
// tap — the hottest path in the app — while hiding ordering bugs behind it.

/**
 * Log a check-in. The variable IS the row, built by `buildCheckinRow`, so the
 * optimistic patch and the insert can never disagree about the id.
 *
 * The options are built by a plain function taking the client so the optimistic
 * patch and its rollback can be exercised directly, with no React and no network
 * — the same seam `lib/data/*`'s fetchers use.
 */
export function logCheckinMutationOptions(client: QueryClient) {
  return {
    mutationFn: insertCheckin,
    onMutate: (row: MarkEventRow) => {
      applyCheckinToCaches(client, row);
    },
    onError: (_error: DataError, row: MarkEventRow) => {
      removeCheckinFromCaches(client, {
        userId: row.user_id,
        markId: row.mark_id,
        eventId: row.id,
        localDate: row.occurred_local_date,
      });
    },
    onSuccess: (serverRow: MarkEventRow) => {
      // Same id, so this REPLACES the optimistic entry rather than adding one.
      applyCheckinToCaches(client, serverRow);
    },
  };
}

export function useLogCheckinMutation() {
  const client = useQueryClient();
  return useMutation<MarkEventRow, DataError, MarkEventRow>(logCheckinMutationOptions(client));
}

export interface UndoCheckinInput {
  eventId: string;
  userId: string;
  markId: string;
  localDate: string;
  /** The row as cached, so a failed undo can be put back exactly as it was. */
  row: MarkEventRow;
}

export function undoCheckinMutationOptions(client: QueryClient) {
  return {
    mutationFn: ({ eventId }: UndoCheckinInput) => softDeleteCheckin(eventId),
    onMutate: (input: UndoCheckinInput) => {
      removeCheckinFromCaches(client, input);
    },
    onError: (_error: DataError, input: UndoCheckinInput) => {
      // Put it back. Without this the count stays down after a failed undo and the
      // user is looking at a check-in the server still holds.
      applyCheckinToCaches(client, input.row);
    },
  };
}

export function useUndoCheckinMutation() {
  const client = useQueryClient();
  return useMutation<void, DataError, UndoCheckinInput>(undoCheckinMutationOptions(client));
}
