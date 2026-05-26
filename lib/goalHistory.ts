import { differenceInDays, parseISO } from 'date-fns';

export function formatDuration(createdAt: string, completedAt: string): string {
  const days = differenceInDays(parseISO(completedAt), parseISO(createdAt));
  if (days <= 0) return 'Same day';
  if (days === 1) return '1 day';
  return `${days} days`;
}

export function formatTargetDelta(completedAt: string, targetDate: string): string {
  const completedDate = completedAt.slice(0, 10);
  const delta = differenceInDays(parseISO(completedDate), parseISO(targetDate));
  if (delta === 0) return 'On time';
  const abs = Math.abs(delta);
  const unit = abs === 1 ? 'day' : 'days';
  return delta < 0 ? `${abs} ${unit} early` : `${abs} ${unit} late`;
}
