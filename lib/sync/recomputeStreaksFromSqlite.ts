/**
 * Post-sync streak recompute: reads ALL non-deleted increment rows from lc_events in SQLite
 * for streak-enabled marks — not the in-memory events store (which may use a 90-day window).
 */
import { query } from '../db';
import type { CounterEvent } from '../../types';
import { computeStreak, updateStreakInDB } from '../../hooks/useStreaks';

type EventRow = {
  id: string;
  user_id: string;
  counter_id: string;
  event_type: string;
  amount: number;
  occurred_at: string;
  occurred_local_date: string;
  meta: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

function mapRowToCounterEvent(row: EventRow): CounterEvent {
  let meta: Record<string, unknown> | undefined;
  try {
    meta = row.meta ? (JSON.parse(row.meta) as Record<string, unknown>) : undefined;
  } catch {
    meta = undefined;
  }
  return {
    id: row.id,
    user_id: row.user_id,
    mark_id: row.counter_id,
    event_type: row.event_type as CounterEvent['event_type'],
    amount: row.amount,
    occurred_at: row.occurred_at,
    occurred_local_date: row.occurred_local_date,
    meta,
    deleted_at: row.deleted_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

const ID_CHUNK = 400;

export type StreakRecomputeSource = 'sqlite_full_increment_events' | 'none' | 'error';

export async function recomputeStreaksAfterSyncFromSqlite(
  userId: string,
  today: Date,
): Promise<{ ok: boolean; marksProcessed: number; source: StreakRecomputeSource }> {
  try {
    const marks = await query<{ id: string }>(
      'SELECT id FROM lc_counters WHERE user_id = ? AND deleted_at IS NULL AND enable_streak = 1',
      [userId],
    );

    if (!marks.length) {
      return { ok: true, marksProcessed: 0, source: 'none' };
    }

    const byMark = new Map<string, CounterEvent[]>();
    for (const m of marks) {
      byMark.set(m.id, []);
    }

    for (let i = 0; i < marks.length; i += ID_CHUNK) {
      const chunk = marks.slice(i, i + ID_CHUNK);
      const placeholders = chunk.map(() => '?').join(',');
      const params: string[] = [userId, ...chunk.map((c) => c.id)];
      const rows = await query<EventRow>(
        `SELECT id, user_id, counter_id, event_type, amount, occurred_at, occurred_local_date, meta, deleted_at, created_at, updated_at
         FROM lc_events
         WHERE user_id = ? AND deleted_at IS NULL AND event_type = 'increment' AND counter_id IN (${placeholders})`,
        params,
      );
      for (const row of rows) {
        const list = byMark.get(row.counter_id);
        if (list) {
          list.push(mapRowToCounterEvent(row));
        }
      }
    }

    for (const m of marks) {
      const evs = byMark.get(m.id) || [];
      const streakData = computeStreak(evs, today);
      await updateStreakInDB(m.id, userId, streakData);
    }

    return { ok: true, marksProcessed: marks.length, source: 'sqlite_full_increment_events' };
  } catch {
    return { ok: false, marksProcessed: 0, source: 'error' };
  }
}
