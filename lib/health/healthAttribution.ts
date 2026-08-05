// lib/health/healthAttribution.ts
//
// "Logged from Apple Health" (health-auto-sync T4, spec §2.8): the mark-detail
// surface asks one question — does this mark have a live health-sourced
// check-in on this day? Pure over MarkEventRow lists so the screen keeps a
// one-line ternary and the rule is pinned in tests.

import type { MarkEventRow } from '../data/types';

/**
 * True when a live (non-tombstoned) increment attributed `source: 'health'`
 * exists for `markId` on local date `day`.
 *
 * KNOWN LIMIT (T3 finding 2, post-migration follow-up): pulled rows carry no
 * `source` until the server migration applies and 'source' joins
 * MARK_EVENT_COLUMNS — until then only rows written locally this session are
 * visible here. The predicate needs no change when that lands.
 */
export function hasHealthCheckinOn(
  rows: readonly MarkEventRow[] | undefined,
  markId: string,
  day: string,
): boolean {
  if (!rows || rows.length === 0) return false;
  return rows.some(
    (r) =>
      r.mark_id === markId &&
      r.event_type === 'increment' &&
      !r.deleted_at &&
      r.occurred_local_date === day &&
      r.source === 'health',
  );
}
