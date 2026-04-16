/**
 * Denormalized total invariant (local SQLite):
 *
 * `lc_counters.total` is a performance cache. The canonical history is `lc_events` (non-deleted rows).
 * After any change that mutates events without going through the paired increment/decrement handlers,
 * or after sync merges counters before events, totals must be aligned via replay:
 *
 *   total === replay(increment → +amount, decrement → -amount clamped at 0, reset → 0), ordered by
 *   occurred_at ASC, id ASC.
 *
 * Remote/server totals are not trusted over local persisted events once those events are merged.
 *
 * Residual edge: a process crash after `lc_counters.total` is updated but before the matching `lc_events` INSERT
 * completes can leave total > replay(events) until the next targeted reconcile (e.g. pull, undo path, or
 * diagnostics-driven awareness). The increment path awaits both writes sequentially to minimize this window.
 */
import { query, execute, queryFirst } from './index';

type EventRow = {
  id: string;
  event_type: string;
  amount: number;
  occurred_at: string;
};

/** Deterministic total from persisted non-deleted events for one mark (counter_id). */
export async function computeMarkTotalFromPersistedEvents(markId: string): Promise<number> {
  const rows = await query<EventRow>(
    `SELECT id, event_type, amount, occurred_at FROM lc_events
     WHERE counter_id = ? AND deleted_at IS NULL
     ORDER BY occurred_at ASC, id ASC`,
    [markId],
  );
  let t = 0;
  for (const row of rows) {
    const amt =
      typeof row.amount === 'number' && Number.isFinite(row.amount) ? row.amount : 0;
    if (row.event_type === 'increment') {
      t += amt;
    } else if (row.event_type === 'decrement') {
      t = Math.max(0, t - amt);
    } else if (row.event_type === 'reset') {
      t = 0;
    }
  }
  return t;
}

export type ReconcileMarkTotalResult = {
  previousTotal: number;
  nextTotal: number;
  updated: boolean;
};

/** Writes lc_counters.total when it differs from replay(lc_events). No-op if mark missing or soft-deleted. */
export async function reconcileMarkTotalWithPersistedEvents(
  userId: string,
  markId: string,
): Promise<ReconcileMarkTotalResult> {
  const row = await queryFirst<{ total: number; deleted_at: string | null }>(
    'SELECT total, deleted_at FROM lc_counters WHERE id = ? AND user_id = ?',
    [markId, userId],
  );
  if (!row || row.deleted_at) {
    return { previousTotal: 0, nextTotal: 0, updated: false };
  }
  const nextTotal = await computeMarkTotalFromPersistedEvents(markId);
  const previousTotal = typeof row.total === 'number' && Number.isFinite(row.total) ? row.total : 0;
  if (previousTotal === nextTotal) {
    return { previousTotal, nextTotal, updated: false };
  }
  const now = new Date().toISOString();
  await execute(
    'UPDATE lc_counters SET total = ?, updated_at = ? WHERE id = ? AND user_id = ?',
    [nextTotal, now, markId, userId],
  );
  return { previousTotal, nextTotal, updated: true };
}

/** Targeted repair for marks touched during a pull (counters and/or events merged). */
export async function reconcileMarkTotalsAfterPull(
  userId: string,
  markIds: Iterable<string>,
): Promise<number> {
  let repaired = 0;
  const seen = new Set<string>();
  for (const id of markIds) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const r = await reconcileMarkTotalWithPersistedEvents(userId, id);
    if (r.updated) repaired += 1;
  }
  return repaired;
}

/** Diagnostics: marks where denormalized total ≠ replay(events). No PII beyond internal ids. */
export async function scanMarkTotalMismatchesForUser(
  userId: string,
): Promise<Array<{ markId: string; rowTotal: number; eventTotal: number }>> {
  const marks = await query<{ id: string }>(
    'SELECT id FROM lc_counters WHERE user_id = ? AND deleted_at IS NULL',
    [userId],
  );
  const mismatches: Array<{ markId: string; rowTotal: number; eventTotal: number }> = [];
  for (const m of marks) {
    const row = await queryFirst<{ total: number }>('SELECT total FROM lc_counters WHERE id = ?', [
      m.id,
    ]);
    const eventTotal = await computeMarkTotalFromPersistedEvents(m.id);
    const rowTotal =
      typeof row?.total === 'number' && Number.isFinite(row.total) ? row.total : 0;
    if (rowTotal !== eventTotal) {
      mismatches.push({ markId: m.id, rowTotal, eventTotal });
    }
  }
  return mismatches;
}
