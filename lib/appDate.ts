import { useAppDateStore } from '../state/appDateSlice';

/** True only in __DEV__ when a YYYY-MM-DD override is set. */
export function isDebugAppDateActive(): boolean {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return false;
  const o = useAppDateStore.getState().debugDateOverride;
  return typeof o === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o);
}

/**
 * App “current” calendar date (local). In dev with an override, returns that date at local noon.
 * Production: real `new Date()`.
 */
export function getAppDate(): Date {
  if (isDebugAppDateActive()) {
    const o = useAppDateStore.getState().debugDateOverride!;
    const [y, m, d] = o.split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0, 0);
  }
  return new Date();
}

/**
 * “Now” for local event timestamps: simulated calendar day + real clock time.
 * Skips anti-cheat time checks when combined with `isDebugAppDateActive()` in counters.
 */
export function getAppDateTime(): Date {
  if (!isDebugAppDateActive()) return new Date();
  const base = getAppDate();
  const real = new Date();
  return new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate(),
    real.getHours(),
    real.getMinutes(),
    real.getSeconds(),
    real.getMilliseconds(),
  );
}
