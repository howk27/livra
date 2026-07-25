// Earned identity (spec §2): facts early, identity claims only once true.
// Pure: derives the milestone this log EARNED from the event ledger plus the
// ids this mark has already spoken. Not "crossed": a crossing log that lands
// while no VoiceLine surface is mounted (mark detail) used to lose its
// milestone forever, because the next log's total is no longer a threshold.
// So the question is "what is the highest milestone this mark has earned and
// not yet said", which the crossing log answers identically and a later log
// answers as catch-up. The fired ids are the caller's (state/identitySlice
// persists them); nothing is recorded here, and nothing is recorded for a
// milestone that was derived but never spoken.
import type { MarkEvent } from '../types';

export type IdentityMilestone = { id: string; tier: 'fact' | 'identity'; n: number };

const FACT_THRESHOLDS = [3, 7, 10, 20, 30, 50];
const IDENTITY_MIN_LOGS = 12;
const IDENTITY_MIN_WEEKS = 3;
export const IDENTITY_MILESTONE_ID = 'identity-12w3';

/** ISO-Monday week key for a yyyy-MM-dd date string (UTC math is safe: the
 *  string IS the local date; no timezone conversion happens here). */
function mondayWeekKey(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

/**
 * The milestone this mark has earned and not yet spoken, or null when it is
 * level with its ledger. `firedIds` is the mark's own fired list (identitySlice
 * shape); pass `[]` for a mark that has never spoken.
 */
export function milestoneForLog(
  markId: string,
  events: MarkEvent[],
  firedIds: string[],
): IdentityMilestone | null {
  let total = 0;
  const weeks = new Set<string>();
  for (const e of events) {
    if (e.deleted_at || e.event_type !== 'increment' || e.mark_id !== markId) continue;
    total += 1; // milestones count check-ins, not amounts — one log = one brick
    weeks.add(mondayWeekKey(e.occurred_local_date));
  }
  if (total === 0) return null;

  // Identity outranks fact: while both bars stand satisfied and the claim is
  // unspoken, it is the answer, whichever log finally asks.
  if (
    weeks.size >= IDENTITY_MIN_WEEKS &&
    total >= IDENTITY_MIN_LOGS &&
    !firedIds.includes(IDENTITY_MILESTONE_ID)
  ) {
    return { id: IDENTITY_MILESTONE_ID, tier: 'identity', n: total };
  }

  // Highest earned fact ABOVE everything already said. The high-water rule is
  // what keeps a catch-up from walking back down the ladder: a mark that has
  // spoken fact-20 never returns to fact-10, even on a log that skipped both.
  const spoken = firedHighWater(firedIds);
  const pending = FACT_THRESHOLDS.filter((t) => t <= total && t > spoken);
  const n = pending[pending.length - 1];
  return n === undefined ? null : { id: `fact-${n}`, tier: 'fact', n };
}

/** The level of the highest milestone already spoken for a mark; 0 for none.
 *  The identity claim sits at its own log bar, so a later fact must clear it. */
function firedHighWater(firedIds: string[]): number {
  let high = 0;
  for (const id of firedIds) {
    if (id === IDENTITY_MILESTONE_ID) {
      high = Math.max(high, IDENTITY_MIN_LOGS);
      continue;
    }
    const n = id.startsWith('fact-') ? Number(id.slice('fact-'.length)) : NaN;
    if (Number.isFinite(n)) high = Math.max(high, n);
  }
  return high;
}
