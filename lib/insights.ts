/**
 * Weekly insight pattern queries — Layer 4.
 * Finite pattern-matching against log history. No AI. Specificity is the emotional payload.
 */

export interface LogEntry {
  mark_id: string;
  occurred_local_date: string; // yyyy-MM-dd
  mark_name?: string;
}

/** Day-of-week name from a yyyy-MM-dd string. */
function dowName(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()];
}

function dowIndex(dateStr: string): number {
  return new Date(dateStr + 'T00:00:00').getDay();
}

export function getWeeklyInsight(logs: LogEntry[], markNames: Record<string, string> = {}): string {
  if (logs.length < 7) return '';

  const allDates = [...new Set(logs.map(l => l.occurred_local_date))].sort();
  const totalDays = allDates.length;

  // ── Pattern 1: Never missed a specific day of week ──────────────────────
  // Check if all days ever logged include every occurrence of a weekday
  if (totalDays >= 14) {
    const dowCounts = new Array(7).fill(0);
    const dowLogged = new Array(7).fill(0);
    // Count every weekday occurrence in the date range
    const first = new Date(allDates[0] + 'T00:00:00');
    const last  = new Date(allDates[allDates.length - 1] + 'T00:00:00');
    const logSet = new Set(allDates);
    const cursor = new Date(first);
    while (cursor <= last) {
      dowCounts[cursor.getDay()]++;
      if (logSet.has(cursor.toISOString().slice(0, 10))) dowLogged[cursor.getDay()]++;
      cursor.setDate(cursor.getDate() + 1);
    }
    for (let d = 0; d < 7; d++) {
      if (dowCounts[d] >= 4 && dowLogged[d] === dowCounts[d]) {
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        return `You've never missed a ${dayNames[d]}.`;
      }
    }
  }

  // ── Pattern 2: Longest streaks start on a specific day ─────────────────
  if (totalDays >= 10) {
    const streakStarts: number[] = [];
    for (let i = 0; i < allDates.length; i++) {
      const prev = i > 0 ? allDates[i - 1] : null;
      if (!prev) { streakStarts.push(dowIndex(allDates[i])); continue; }
      const gap = (new Date(allDates[i] + 'T00:00:00').getTime() - new Date(prev + 'T00:00:00').getTime()) / 86400000;
      if (gap > 1) streakStarts.push(dowIndex(allDates[i]));
    }
    if (streakStarts.length >= 3) {
      const tally = new Array(7).fill(0);
      streakStarts.forEach(d => tally[d]++);
      const maxCount = Math.max(...tally);
      const maxDay = tally.indexOf(maxCount);
      if (maxCount >= 2 && maxCount >= streakStarts.length * 0.4) {
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        return `Your longest streaks all start on ${dayNames[maxDay]}s.`;
      }
    }
  }

  // ── Pattern 3: One mark stronger than others ────────────────────────────
  const markIds = [...new Set(logs.map(l => l.mark_id))];
  if (markIds.length >= 2) {
    const countsByMark: Record<string, number> = {};
    logs.forEach(l => { countsByMark[l.mark_id] = (countsByMark[l.mark_id] ?? 0) + 1; });
    const sorted = Object.entries(countsByMark).sort((a, b) => b[1] - a[1]);
    const strongest = sorted[0];
    const weakest   = sorted[sorted.length - 1];
    if (strongest[1] >= weakest[1] * 1.5) {
      const strongName = markNames[strongest[0]] ?? 'Your top mark';
      const weakName   = markNames[weakest[0]]   ?? 'another mark';
      return `${strongName} is your strongest mark. ${weakName} is where you slip.`;
    }
  }

  // ── Pattern 4: Best month ───────────────��───────────────────────────────
  if (totalDays >= 20) {
    const byMonth: Record<string, number> = {};
    allDates.forEach(d => {
      const month = d.slice(0, 7);
      byMonth[month] = (byMonth[month] ?? 0) + 1;
    });
    const entries = Object.entries(byMonth).sort((a, b) => b[1] - a[1]);
    const best = entries[0];
    if (best && entries.length >= 2) {
      const [year, mon] = best[0].split('-');
      const monthName = new Date(Number(year), Number(mon) - 1, 1).toLocaleString('default', { month: 'long' });
      return `${monthName} was your best month. What was different?`;
    }
  }

  // ── Pattern 5: Recent trend ────────────────────��────────────────────────
  const recentDates = allDates.slice(-14);
  const recentLogged = recentDates.length;
  if (recentLogged >= 6) {
    return `You've logged ${recentLogged} of the last ${Math.min(14, totalDays)} days.`;
  }

  // ── Fallback ───────────────────────────���─────────────���──────────────────
  return 'One more day this week would have been your best ever.';
}
