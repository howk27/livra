/**
 * Momentum system — Livra 2.0 Layer 5.
 * Cumulative score + title progression. Never resets.
 */

export interface MarkLifetimeStat {
  markId: string;
  name: string;
  totalLogged: number;
  bestStreak: number;
}

// ── Momentum score ───────────────────────────────────────────────────────────

/**
 * Total marks ever logged + milestone bonuses.
 * Milestone bonuses: Day 7 = +7, Day 14 = +14, Day 30 = +30.
 * Calculated from full event history on first 2.0 launch.
 */
export function calculateMomentum(
  totalMarksLogged: number,
  longestStreak: number,
): number {
  let bonus = 0;
  if (longestStreak >= 7)  bonus += 7;
  if (longestStreak >= 14) bonus += 14;
  if (longestStreak >= 30) bonus += 30;
  return totalMarksLogged + bonus;
}

// ── Titles ───────────────────────────────────────────────────────────────────

export interface TitleRecord {
  title: string;
  condition: string;
}

const TITLE_LADDER: Array<{ title: string; totalDays?: number; streakDays?: number }> = [
  { title: 'Unstoppable',      streakDays: 30 },
  { title: 'The Identity',     totalDays: 200 },
  { title: 'The Long Game',    totalDays: 100 },
  { title: 'Quiet Force',      totalDays: 50  },
  { title: 'The Consistent One', streakDays: 14 },
  { title: 'Building Something', totalDays: 30 },
  { title: 'The Streak Starter', streakDays: 7 },
  { title: 'Day One' },
];

export function getCurrentTitle(totalDaysLogged: number, longestStreak: number): string {
  for (const tier of TITLE_LADDER) {
    if (tier.totalDays !== undefined && totalDaysLogged >= tier.totalDays) return tier.title;
    if (tier.streakDays !== undefined && longestStreak >= tier.streakDays) return tier.title;
  }
  return 'Day One';
}

// ── Mark stats ───────────────────────────────────────────────────────────────

export interface LogEvent {
  mark_id: string;
  occurred_local_date: string;
  deleted_at?: string | null;
  event_type: string;
}

export function computeMarkStats(
  events: LogEvent[],
  marks: Array<{ id: string; name: string }>,
): MarkLifetimeStat[] {
  return marks.map(m => {
    const markEvents = events.filter(e => e.mark_id === m.id && !e.deleted_at && e.event_type === 'increment');
    const totalLogged = markEvents.length;

    const dates = [...new Set(markEvents.map(e => e.occurred_local_date))].sort();
    let bestStreak = 0;
    let cur = 0;
    for (let i = 0; i < dates.length; i++) {
      if (i === 0) { cur = 1; continue; }
      const prev = new Date(dates[i - 1] + 'T00:00:00');
      const curr = new Date(dates[i]     + 'T00:00:00');
      const gap  = (curr.getTime() - prev.getTime()) / 86400000;
      cur = gap === 1 ? cur + 1 : 1;
      if (cur > bestStreak) bestStreak = cur;
    }
    if (cur > bestStreak) bestStreak = cur;

    return { markId: m.id, name: m.name, totalLogged, bestStreak };
  });
}
