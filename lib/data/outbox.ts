// lib/data/outbox.ts
//
// M9 Phase 4 Tasks 2–3 — the offline outbox: one append-only queue, its
// persistence, and its flusher.
//
// ONE ENTRY CLASS. Both targets — check-ins (`mark_events`) and goal notes
// (`goal_notes`) — are APPENDS to tables where no conflict is expressible
// (goal_notes has no unique key beyond its id; mark_notes, the one note table
// that had one, is dead and dies in Phase 5). That is why there is no conflict
// resolution anywhere in this file, and why adding any offline write to an
// EDITED value — a rename, a reorder, a per-day keyed note — is a design change,
// not an addition (Spec R6).
//
// IDEMPOTENCY IS STRUCTURAL. An entry's identity IS its row's primary key,
// client-generated before the write left the screen (Phase 3). Flushing twice is
// one INSERT and one 23505, which this file treats as "already landed" — there is
// no dedupe bookkeeping to get wrong.
//
// ENTRIES ARE INDEPENDENT. A permanently-refused entry is dropped ALONE and
// logged; nothing queues behind it. This is the architectural answer to the
// legacy sync's poison pill, where one RLS-rejected row wedged every record
// behind it forever (2026-07-26).
//
// THE QUEUE IS DURABLE, THE QUERY CACHE IS NOT (R4). The outbox persists under
// its own AsyncStorage key, deliberately separate from the persisted query cache
// (`livra-rq-cache`), which may be discarded at any time. An app kill mid-flush
// loses nothing: an entry leaves storage only AFTER its insert succeeded, and a
// kill between the insert and the removal is absorbed by the 23505 path on the
// next launch.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { onlineManager, type QueryClient } from '@tanstack/react-query';
import { dataClient } from '@/lib/data/client';
import { queryKeys } from '@/lib/data/queryKeys';
import { toDataError, isDataError, type DataErrorKind } from '@/lib/data/errors';
import { logger } from '@/lib/utils/logger';
import type { MarkEventRow, GoalNoteRow } from '@/lib/data/types';

/** Account-scoped: registered in `ACCOUNT_SCOPED_STORAGE_KEYS`
 * (lib/db/purgeLocalUserData.ts) so sign-out wipes it — a queued row belongs to
 * the account that wrote it and must never flush under the next sign-in. */
export const OUTBOX_STORAGE_KEY = 'livra-outbox-v1';

export type OutboxEntry =
  | { readonly table: 'mark_events'; readonly row: MarkEventRow }
  | { readonly table: 'goal_notes'; readonly row: GoalNoteRow };

/**
 * Whether a failed flush KEEPS the entry for retry (transient) or DROPS it alone
 * (permanent refusal). Deliberately NOT `DATA_ERROR_RETRIABLE`: that map answers
 * "is an automatic retry worth it right now?" for an interactive request, and it
 * says `auth_expired: false` because a user is present to sign back in. A queued
 * write has no user present — dropping it on a session hiccup would LOSE a real
 * check-in, so `auth_expired` waits in the queue for the sign-in that answers it.
 * Getting either direction wrong is the failure mode the plan names: retry-forever
 * recreates the poison pill, drop-on-transient loses real check-ins.
 *
 * Exhaustive over `DataErrorKind` in a SHIPPED module (tsconfig excludes tests),
 * so a new kind refuses to compile until it is classified here too.
 */
const OUTBOX_KEEP_ON_FAILURE: Record<DataErrorKind, boolean> = {
  network: true,
  server: true,
  auth_expired: true,
  // A refusal repeats identically until something changes server-side (RLS, the
  // free-tier cap, a vanished parent). Dropped alone, logged.
  permission: false,
  limit_reached: false,
  not_found: false,
  unknown: false,
  // Never consulted: 'conflict' means the row is ALREADY THERE and is handled as
  // success before this map is read. Listed for exhaustiveness only.
  conflict: false,
};

// ─── Queue state ─────────────────────────────────────────────────────────────

let entries: readonly OutboxEntry[] = [];
let loaded = false;
let loadPromise: Promise<void> | null = null;
const subscribers = new Set<() => void>();

function notify(): void {
  for (const cb of subscribers) cb();
}

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/** Structural check for rehydrated JSON — corrupt or foreign shapes are dropped
 * (and logged) rather than crashing every flush from now on.
 *
 * FULL per-table shape, not just `table` + `row.id`: a corrupt row that kept its
 * id would rehydrate, fail its INSERT as `server` (23502 not-null violation),
 * be KEPT by OUTBOX_KEEP_ON_FAILURE, and retry at the backoff cadence forever.
 * The fields checked are exactly the NOT NULL columns of each table's Insert. */
function isOutboxEntry(value: unknown): value is OutboxEntry {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as { table?: unknown; row?: unknown };
  if (typeof e.row !== 'object' || e.row === null) return false;
  const row = e.row as Record<string, unknown>;
  if (e.table === 'mark_events') {
    return (
      isNonEmptyString(row.id) &&
      isNonEmptyString(row.user_id) &&
      isNonEmptyString(row.mark_id) &&
      isNonEmptyString(row.event_type) &&
      isNonEmptyString(row.occurred_at) &&
      isNonEmptyString(row.occurred_local_date)
    );
  }
  if (e.table === 'goal_notes') {
    return (
      isNonEmptyString(row.id) &&
      isNonEmptyString(row.user_id) &&
      isNonEmptyString(row.goal_id) &&
      isNonEmptyString(row.local_date) &&
      typeof row.text === 'string'
    );
  }
  return false;
}

async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  loadPromise ??= (async () => {
    try {
      const raw = await AsyncStorage.getItem(OUTBOX_STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        const valid = parsed.filter(isOutboxEntry);
        if (valid.length !== parsed.length) {
          logger.error('[outbox] dropped malformed persisted entries', {
            dropped: parsed.length - valid.length,
          });
        }
        entries = valid;
      }
    } catch (error) {
      logger.error('[outbox] load failed — starting empty', error);
    }
    loaded = true;
    if (entries.length > 0) notify();
  })();
  await loadPromise;
}

async function persist(): Promise<void> {
  try {
    await AsyncStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(entries));
  } catch (error) {
    // Storage broken: the queue survives in memory for this session. The user's
    // action already read as success (D-3) and must not start failing now.
    logger.error('[outbox] persist failed — queue is memory-only this session', error);
  }
}

// ─── Queue API ───────────────────────────────────────────────────────────────

/** For `useSyncExternalStore` in the read-merge hooks. */
export function subscribeOutbox(cb: () => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

/** Stable snapshot — the array is replaced, never mutated, on every change. */
export function pendingOutboxEntries(): readonly OutboxEntry[] {
  return entries;
}

/**
 * The queued goal notes for one goal, PURE over a snapshot. Lives here rather
 * than in `lib/data/notes.ts` deliberately: selecting by `goal_id` is outbox
 * bookkeeping, and the T6 guard rightly bans `.goal_id` access inside the entity
 * read modules, where the same spelling would mean the retiring marks column.
 */
export function pendingGoalNoteRowsIn(
  snapshot: readonly OutboxEntry[],
  userId: string,
  goalId: string,
): GoalNoteRow[] {
  const rows: GoalNoteRow[] = [];
  for (const e of snapshot) {
    if (e.table !== 'goal_notes') continue;
    if (e.row.user_id === userId && e.row.goal_id === goalId) rows.push(e.row);
  }
  return rows;
}

/**
 * Append one entry. APPEND ONLY — nothing in this module ever mutates an entry
 * in place. Durability comes first: the entry is persisted before this resolves,
 * so an app kill immediately after an offline tap still holds the check-in.
 */
export async function enqueueOutboxEntry(entry: OutboxEntry): Promise<void> {
  await ensureLoaded();
  entries = [...entries, entry];
  notify();
  await persist();
}

/**
 * Remove a not-yet-flushed entry by its row id. This is how an offline UNDO of a
 * still-queued check-in (or delete of a still-queued note) works: a row that
 * never reached the server is unsent, not tombstoned — removal here IS the whole
 * operation, and D-3 holds because no network is needed. Returns false when the
 * id is not pending (already flushed, or never queued).
 */
export async function removePendingOutboxEntry(rowId: string): Promise<boolean> {
  await ensureLoaded();
  const next = entries.filter((e) => e.row.id !== rowId);
  if (next.length === entries.length) return false;
  entries = next;
  notify();
  await persist();
  return true;
}

/** Sign-out wipe (called from `purgeLocalUserData`): memory and storage both.
 * Never throws — a stranded signed-in session is worse than a partial wipe. */
export async function clearOutboxAll(): Promise<void> {
  entries = [];
  loaded = true;
  failStreak = 0;
  nextAttemptAt = 0;
  notify();
  try {
    await AsyncStorage.removeItem(OUTBOX_STORAGE_KEY);
  } catch (error) {
    logger.error('[outbox] storage clear failed during purge', error);
  }
}

// ─── The flusher ─────────────────────────────────────────────────────────────

const BASE_BACKOFF_MS = 5 * 1000;
const MAX_BACKOFF_MS = 5 * 60 * 1000;
/** 2^7 * base already exceeds MAX; the cap exists so the exponent cannot grow
 * unboundedly on a queue that fails for days. */
const MAX_FAIL_STREAK = 8;

let failStreak = 0;
let nextAttemptAt = 0; // epoch ms; 0 = no wait
let draining = false;
let drainAgain = false;

async function pushEntry(entry: OutboxEntry): Promise<void> {
  const client = dataClient();
  const { error } =
    entry.table === 'mark_events'
      ? await client.from('mark_events').insert(entry.row)
      : await client.from('goal_notes').insert(entry.row);
  // No `.select()` — we know exactly what we sent, and the read path refetches.
  if (error) throw toDataError(error);
}

export interface FlushOptions {
  /** New information arrived (reconnect, foreground) — the wait is stale. */
  resetBackoff?: boolean;
  /** Test seam for the clock. */
  now?: number;
}

/**
 * Serial drain, independent entries: one entry's failure NEVER blocks the next —
 * each is attempted in turn regardless of what happened to the one before.
 * Success (or "already landed") removes the entry and persists immediately, so a
 * kill mid-drain re-attempts only what has not landed. After a drain that moved
 * anything, the affected queries are invalidated so screens refresh from the
 * server they just caught up with.
 */
export async function flushOutbox(client: QueryClient, opts: FlushOptions = {}): Promise<void> {
  const now = opts.now ?? Date.now();
  if (opts.resetBackoff) {
    failStreak = 0;
    nextAttemptAt = 0;
  }
  await ensureLoaded();
  if (entries.length === 0) return;
  if (!onlineManager.isOnline()) return; // offline is a state, not an error
  // Backwards-clock guard: a wait computed against a later clock reads as
  // farther away than the cap allows — treat it as elapsed rather than stranding
  // the queue (this repo shipped exactly this bug in a resend cooldown once).
  if (nextAttemptAt - now > MAX_BACKOFF_MS) nextAttemptAt = 0;
  if (now < nextAttemptAt) return;

  if (draining) {
    drainAgain = true;
    return;
  }
  draining = true;
  try {
    do {
      drainAgain = false;
      let sawTransient = false;
      const flushedCheckinUsers = new Set<string>();
      const flushedNoteKeys = new Set<string>(); // `${userId} ${goalId}`

      for (const entry of [...entries]) {
        let landed = false;
        try {
          await pushEntry(entry);
          landed = true;
        } catch (raw) {
          const err = isDataError(raw) ? raw : toDataError(raw);
          if (err.kind === 'conflict') {
            // The row is already there — a previous flush landed and was
            // interrupted before removal. That is success.
            landed = true;
          } else if (OUTBOX_KEEP_ON_FAILURE[err.kind]) {
            sawTransient = true; // keep the entry; still try the next one
          } else {
            // Ids only — a goal note's text has no business in a log line.
            logger.error('[outbox] entry permanently refused — dropped alone', {
              table: entry.table,
              id: entry.row.id,
              kind: err.kind,
            });
            await removePendingOutboxEntry(entry.row.id);
          }
        }
        if (landed) {
          await removePendingOutboxEntry(entry.row.id);
          if (entry.table === 'mark_events') {
            flushedCheckinUsers.add(entry.row.user_id);
          } else {
            flushedNoteKeys.add(`${entry.row.user_id} ${entry.row.goal_id}`);
          }
        }
      }

      if (sawTransient) {
        failStreak = Math.min(failStreak + 1, MAX_FAIL_STREAK);
        nextAttemptAt =
          (opts.now ?? Date.now()) +
          Math.min(BASE_BACKOFF_MS * 2 ** (failStreak - 1), MAX_BACKOFF_MS);
      } else {
        failStreak = 0;
        nextAttemptAt = 0;
      }

      for (const userId of flushedCheckinUsers) {
        void client.invalidateQueries({ queryKey: queryKeys.checkinsRoot(userId) });
      }
      for (const key of flushedNoteKeys) {
        const [userId, goalId] = key.split(' ');
        void client.invalidateQueries({ queryKey: queryKeys.goalNotes(userId, goalId) });
      }
    } while (drainAgain && entries.length > 0 && onlineManager.isOnline() && nextAttemptAt === 0);
  } finally {
    draining = false;
  }
}

/**
 * Wire the drain triggers (plan Task 3 Step 1): app start, regained
 * connectivity, and app foreground. The third trigger — "after any successful
 * write" — lives in the mutations' `onSuccess`, which already hold the client.
 * Reconnect and foreground reset the backoff: they are new information, and the
 * wait they interrupt was computed against a world that no longer exists.
 */
export function startOutbox(client: QueryClient): () => void {
  void flushOutbox(client);
  const unsubscribeOnline = onlineManager.subscribe((online) => {
    if (online) void flushOutbox(client, { resetBackoff: true });
  });
  const appStateSub = AppState.addEventListener('change', (state) => {
    if (state === 'active') void flushOutbox(client, { resetBackoff: true });
  });
  return () => {
    unsubscribeOnline();
    appStateSub.remove();
  };
}

// ─── Test seam ───────────────────────────────────────────────────────────────

/** Reset every piece of module state. Tests only. */
export function __resetOutboxForTests(): void {
  entries = [];
  loaded = false;
  loadPromise = null;
  failStreak = 0;
  nextAttemptAt = 0;
  draining = false;
  drainAgain = false;
  subscribers.clear();
}
