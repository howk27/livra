// lib/data/derived.ts
//
// M9 Phase 4 Task 1 — `total` and the current streak are DERIVED from the event
// log, never stored. One value cannot drift from itself: this module is what
// retires the two-value bookkeeping (`marks.total` + `mark_events`) that needed
// `lib/db/markTotalReconciliation.ts` (117 lines) to keep in step. That module and
// `reconcileMarkTotalWithPersistedEvents` are now unreachable from the migrated
// path — noted for deletion in Phase 5, alongside the server column itself, which
// deliberately stays (unread) as a diagnostic (spec §12.3).
//
// VERIFIED AGAINST REAL DATA before being trusted (plan Task 1 Step 6, run
// 2026-07-31 via MCP over all 36 live marks): SUM(amount) over live `increment`
// events equals the stored `marks.total` on 35 of 36 — and the one divergence is
// the STORED value being stale (a web-test undo tombstoned the event while the
// legacy push kept the old total), which is precisely the drift this phase
// removes. Legacy `decrement` (4) and `reset` (3) events exist in history and
// produced no divergence anywhere; the increment-only derivation matches what the
// mark-detail screen has always rendered as its all-time count.
//
// BADGES ARE NOT DERIVED (plan Task 1 Step 3). "You earned this" is a fact, not a
// calculation — recomputing awards would let a rule change silently revoke them.
// Badge rows stay stored; nothing here reads or writes them.

/**
 * The event shape the derivations need — STRUCTURAL, so the query layer's
 * `MarkEventRow` and the legacy `MarkEvent`/`CounterEvent` domain types all
 * satisfy it without casts. Nullability is the union of what those sources allow.
 */
export interface DerivableEvent {
  event_type: string;
  amount?: number | null;
  occurred_local_date?: string | null;
  deleted_at?: string | null;
}

export interface MarkScopedEvent extends DerivableEvent {
  mark_id: string;
}

export interface StreakData {
  current: number;
  longest: number;
  lastDate?: string;
}

const LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A live check-in: an `increment` that has not been undone (tombstoned). Every
 * derivation in this module counts exactly these and nothing else. */
function isLiveIncrement(e: DerivableEvent): boolean {
  return e.event_type === 'increment' && !e.deleted_at;
}

/**
 * All-time total for one mark's events: the sum of live increment amounts.
 * Identical to the mark-detail screen's `allTimeTotal` derivation — that identity
 * is what the live-data verification above proved safe.
 */
export function deriveTotal(events: readonly DerivableEvent[]): number {
  let total = 0;
  for (const e of events) {
    if (isLiveIncrement(e)) total += e.amount ?? 1;
  }
  return total;
}

/**
 * All-time totals for a whole event list, keyed by mark. The list screens fetch
 * every check-in once (`useUserCheckins`) and feed their mark adapters from this
 * map — replacing the stored `marks.total`, which Phase 3 stopped maintaining and
 * which was therefore already stale for any post-Phase-3 activity (the goal
 * medallion's `dominantMark` pick was quietly drifting on it).
 */
export function totalsByMark(events: readonly MarkScopedEvent[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const e of events) {
    if (!isLiveIncrement(e)) continue;
    totals.set(e.mark_id, (totals.get(e.mark_id) ?? 0) + (e.amount ?? 1));
  }
  return totals;
}

/**
 * Current + longest streak from the event log. This is the canonical streak math,
 * MOVED here from `hooks/useStreaks.ts` (which now delegates) so the derivation
 * lives with the data layer and survives Phase 5's deletion of the old system.
 * Behaviour is unchanged: unique local dates with live increments; the current
 * streak tolerates a 1-day gap (yesterday keeps it alive); day boundaries are the
 * device-local `occurred_local_date`, parsed at local noon to dodge UTC-midnight.
 */
export function deriveStreak(events: readonly DerivableEvent[], today: Date): StreakData {
  const activityDates = new Set<string>();
  for (const e of events) {
    if (!isLiveIncrement(e)) continue;
    const d = e.occurred_local_date;
    if (d && LOCAL_DATE_RE.test(d)) activityDates.add(d);
  }

  if (activityDates.size === 0) return { current: 0, longest: 0 };

  const sortedDates = [...activityDates].sort();
  const lastDate = sortedDates[sortedDates.length - 1];

  // Parse yyyy-MM-dd as LOCAL NOON so day arithmetic never crosses a UTC boundary.
  const localNoon = (dateStr: string) => new Date(dateStr + 'T12:00:00');
  const formatLocal = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const todayStr = formatLocal(today);

  const DAY_MS = 24 * 60 * 60 * 1000;
  const MAX_STREAK_DAYS = 1000;

  let current = 0;
  const daysSinceLast = Math.floor(
    (localNoon(todayStr).getTime() - localNoon(lastDate).getTime()) / DAY_MS,
  );
  if (daysSinceLast <= 1) {
    let check = localNoon(lastDate);
    let safety = 0;
    while (activityDates.has(formatLocal(check)) && safety < MAX_STREAK_DAYS) {
      current++;
      check = new Date(check.getTime() - DAY_MS);
      // Re-anchor to noon: a DST transition shifts a -24h step to 11:00/13:00, and
      // two more of them could walk the timestamp across a date boundary.
      check = localNoon(formatLocal(check));
      safety++;
    }
  }

  let longest = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const dateStr of sortedDates) {
    const d = localNoon(dateStr);
    if (prev === null) {
      run = 1;
    } else if (Math.floor((d.getTime() - prev.getTime()) / DAY_MS) === 1) {
      run++;
    } else {
      longest = Math.max(longest, run);
      run = 1;
    }
    prev = d;
  }
  longest = Math.max(longest, run);

  return { current, longest, lastDate };
}
