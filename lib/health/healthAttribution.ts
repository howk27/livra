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
 * Since 2026-08-05 'source' is in MARK_EVENT_COLUMNS (server migration
 * applied), so pulled rows carry attribution too — not just rows written
 * locally this session. The predicate itself never needed to change.
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
