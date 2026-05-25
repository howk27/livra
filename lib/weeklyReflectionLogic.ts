import type { ReflectionTier } from './weeklyReflectionCopy';
import type { MarkEvent } from '../types';

export function classifyMarkTier(
  markId: string,
  events: MarkEvent[],
  weekDates: string[],
  isFirstWeek: boolean,
): ReflectionTier {
  if (isFirstWeek) return 'first_week';

  const activeDates = new Set(
    events
      .filter(
        e =>
          e.mark_id === markId &&
          !e.deleted_at &&
          e.event_type === 'increment' &&
          weekDates.includes(e.occurred_local_date),
      )
      .map(e => e.occurred_local_date),
  );

  const daysLogged = activeDates.size;
  const totalDays = weekDates.length;

  if (daysLogged === 0) return 'missing';
  if (daysLogged / totalDays >= 5 / 7) return 'strong';
  if (daysLogged / totalDays >= 3 / 7) return 'solid';
  return 'inconsistent';
}

export function isMarkFirstWeek(markCreatedAt: string, weekStart: string): boolean {
  const created = new Date(`${markCreatedAt.slice(0, 10)}T00:00:00`);
  const week = new Date(`${weekStart}T00:00:00`);
  const diffMs = week.getTime() - created.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays < 7;
}
