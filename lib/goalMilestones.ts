import { differenceInDays, parseISO } from 'date-fns';
import type { Goal } from '../types/goal';

export const MILESTONE_COPY: Record<string, string> = {
  '25': "A quarter of the way there. Keep going.",
  '50': "Halfway. You're still here.",
  '75': "Almost. Don't stop now.",
  '7':  "One week in. That's something.",
  '30': "A month of showing up. It's working.",
  '60': "Two months. This one's yours now.",
};

const DATED_KEYS = ['25', '50', '75'] as const;
const DATELESS_KEYS = ['7', '30', '60'] as const;

/** Arc sweep for a dated milestone: from the previous threshold, never from a
 *  cold zero on re-render (goal-gradient: show accumulated progress). Null for
 *  dateless day-count milestones. */
export function milestoneArcRange(key: string): { from: number; to: number } | null {
  const idx = (DATED_KEYS as readonly string[]).indexOf(key);
  if (idx === -1) return null;
  const prev = idx === 0 ? 0 : parseInt(DATED_KEYS[idx - 1], 10) / 100;
  return { from: prev, to: parseInt(key, 10) / 100 };
}

export function getMilestonesToFire(goal: Goal, today: Date): string[] {
  if (goal.status !== 'active') return [];

  const fired = goal.milestones_fired ?? [];
  const due: string[] = [];

  if (goal.target_date) {
    const totalDays = differenceInDays(parseISO(goal.target_date), parseISO(goal.created_at));
    if (totalDays <= 0) return [];
    const elapsedDays = differenceInDays(today, parseISO(goal.created_at));
    const progress = (elapsedDays / totalDays) * 100;

    for (const key of DATED_KEYS) {
      const threshold = parseInt(key, 10);
      if (progress >= threshold && !fired.includes(key)) {
        due.push(key);
      }
    }
  } else {
    const elapsedDays = differenceInDays(today, parseISO(goal.created_at));

    for (const key of DATELESS_KEYS) {
      const threshold = parseInt(key, 10);
      if (elapsedDays >= threshold && !fired.includes(key)) {
        due.push(key);
      }
    }
  }

  return due;
}
