import type { Mark } from '../types';

const MIN = 1;
const MAX = 99;

/** User-facing daily completion target; default 1 (single tap completes the day). */
export function resolveDailyTarget(mark: Pick<Mark, 'dailyTarget'> | Record<string, unknown>): number {
  const raw = (mark as Mark).dailyTarget;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (Number.isFinite(n) && n > 0) return Math.min(MAX, Math.floor(n));
  return 1;
}

export function normalizeDailyTargetInput(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < MIN) return MIN;
  return Math.min(MAX, Math.floor(n));
}
