// Earned identity (spec §2): facts early, identity claims only once true.
// Pure: derives the milestone THIS log crossed from the event ledger alone.
// Once-ever enforcement lives in state/identitySlice — not here.
import type { MarkEvent } from '../types';

export type IdentityMilestone = { id: string; tier: 'fact' | 'identity'; n: number };

const FACT_THRESHOLDS = [3, 7, 10, 20, 30, 50];
const IDENTITY_MIN_LOGS = 12;
const IDENTITY_MIN_WEEKS = 3;

/** ISO-Monday week key for a yyyy-MM-dd date string (UTC math is safe: the
 *  string IS the local date; no timezone conversion happens here). */
function mondayWeekKey(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export function milestoneForLog(markId: string, events: MarkEvent[]): IdentityMilestone | null {
  let total = 0;
  const weeks = new Set<string>();
  for (const e of events) {
    if (e.deleted_at || e.event_type !== 'increment' || e.mark_id !== markId) continue;
    total += 1; // milestones count check-ins, not amounts — one log = one brick
    weeks.add(mondayWeekKey(e.occurred_local_date));
  }
  if (total === 0) return null;

  // Identity outranks fact when both cross at once. It fires exactly when the
  // log count FIRST satisfies both bars: at total === 12 with weeks ≥ 3, or on
  // the log that adds the 3rd week when the count was already past 12.
  if (weeks.size >= IDENTITY_MIN_WEEKS && total >= IDENTITY_MIN_LOGS) {
    const crossedNow =
      total === IDENTITY_MIN_LOGS ||
      (total > IDENTITY_MIN_LOGS && justAddedWeek(markId, events, weeks.size));
    if (crossedNow) return { id: 'identity-12w3', tier: 'identity', n: total };
  }

  if (FACT_THRESHOLDS.includes(total)) return { id: `fact-${total}`, tier: 'fact', n: total };
  return null;
}

/** True when the chronologically-last event is the sole member of its week —
 *  i.e., THIS log opened a new distinct week. */
function justAddedWeek(markId: string, events: MarkEvent[], _weekCount: number): boolean {
  const mine = events
    .filter((e) => !e.deleted_at && e.event_type === 'increment' && e.mark_id === markId)
    .sort((a, b) => a.occurred_local_date.localeCompare(b.occurred_local_date));
  const last = mine[mine.length - 1];
  if (!last) return false;
  const lastWeek = mondayWeekKey(last.occurred_local_date);
  return mine.filter((e) => mondayWeekKey(e.occurred_local_date) === lastWeek).length === 1;
}
