import type { DailyCheckin } from '../types/checkin';

export function getTodayCheckin(
  checkins: DailyCheckin[],
  goalId: string,
  todayDate: string,
): DailyCheckin | undefined {
  return checkins.find(c => c.goal_id === goalId && c.date === todayDate);
}

export function hasCheckedInToday(
  checkins: DailyCheckin[],
  goalId: string,
  todayDate: string,
): boolean {
  return getTodayCheckin(checkins, goalId, todayDate) !== undefined;
}

export function getCheckinStreak(
  checkins: DailyCheckin[],
  goalId: string,
  todayDate: string,
): number {
  const positives = checkins
    .filter(c => c.goal_id === goalId && c.showed_up)
    .sort((a, b) => b.date.localeCompare(a.date));

  if (positives.length === 0) return 0;

  let streak = 0;
  let cursor = new Date(`${todayDate}T00:00:00`);

  for (const entry of positives) {
    const entryDate = entry.date;
    const cursorStr = cursor.toISOString().slice(0, 10);
    if (entryDate === cursorStr) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else if (entryDate < cursorStr) {
      break;
    }
  }

  return streak;
}
