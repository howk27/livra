import { differenceInDays, parseISO, addDays, format } from 'date-fns';
import type { MarkEvent } from '../types';

export function computePace(
  events: MarkEvent[],
  markCount: number,
  daysElapsed: number,
): number {
  if (markCount === 0 || daysElapsed === 0) return 1;
  const window = Math.min(daysElapsed, 14);
  const cutoffDate = format(addDays(new Date(), -window), 'yyyy-MM-dd');
  const recent = events.filter(
    e =>
      e.event_type === 'increment' &&
      !e.deleted_at &&
      e.occurred_local_date >= cutoffDate,
  );
  const pairs = new Set(recent.map(e => `${e.mark_id}:${e.occurred_local_date}`));
  return pairs.size / (markCount * window);
}

export function computeProjectedMiss(
  targetDate: string,
  pace: number,
): number {
  const today = format(new Date(), 'yyyy-MM-dd');
  const remainingDays = Math.max(0, differenceInDays(parseISO(targetDate), parseISO(today)));
  if (remainingDays === 0) return 0;
  const projectedDays = pace > 0 ? Math.ceil(remainingDays / pace) : remainingDays + 30;
  return Math.max(0, projectedDays - remainingDays);
}

export function suggestNewTargetDate(
  targetDate: string,
  pace: number,
): string {
  const today = format(new Date(), 'yyyy-MM-dd');
  const remainingDays = Math.max(0, differenceInDays(parseISO(targetDate), parseISO(today)));
  const projectedDays = pace > 0 ? Math.ceil(remainingDays / pace) : remainingDays + 30;
  return format(addDays(new Date(), projectedDays), 'yyyy-MM-dd');
}

export function isPaceBehind(projectedMiss: number): boolean {
  return projectedMiss >= 7;
}
