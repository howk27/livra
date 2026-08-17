import { getHealthNative } from './healthNative';
import type { HealthKitType } from './healthTypes';
import { STEP_GOAL_FALLBACK } from './healthDefaults';

// Every reader treats a callback error as "no days"; an unavailable native
// module (see healthNative) gets the same quiet empty result rather than a
// synchronous throw inside the Promise executor.

function isoStart(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toISOString();
}
function isoEnd(dateStr: string): string {
  return new Date(`${dateStr}T23:59:59`).toISOString();
}

export async function readWorkoutDays(weekDates: string[]): Promise<Set<string>> {
  const start = isoStart(weekDates[0]!);
  const end = isoEnd(weekDates[weekDates.length - 1]!);
  return new Promise(resolve => {
    const native = getHealthNative();
    if (!native) { resolve(new Set()); return; }
    native.getSamples(
      { startDate: start, endDate: end, type: 'Workout' } as any,
      (err: any, results: any[]) => {
        if (err || !results) { resolve(new Set()); return; }
        const days = new Set(results.map(r => r.startDate.slice(0, 10)));
        resolve(days);
      },
    );
  });
}

export async function readSleepDays(weekDates: string[]): Promise<Set<string>> {
  const start = new Date(`${weekDates[0]!}T00:00:00`);
  start.setDate(start.getDate() - 1);
  start.setHours(20, 0, 0, 0);
  const end = new Date(`${weekDates[weekDates.length - 1]!}T10:00:00`);

  return new Promise(resolve => {
    const native = getHealthNative();
    if (!native) { resolve(new Set()); return; }
    native.getSleepSamples(
      { startDate: start.toISOString(), endDate: end.toISOString() } as any,
      (err: any, results: any[]) => {
        if (err || !results) { resolve(new Set()); return; }
        const days = new Set<string>();
        for (const sample of results) {
          if (sample.value === 'AWAKE' || sample.value === 'INBED') continue;
          const wakeDate = sample.endDate?.slice(0, 10);
          if (wakeDate && weekDates.includes(wakeDate)) days.add(wakeDate);
        }
        resolve(days);
      },
    );
  });
}

export async function readHydrationDays(weekDates: string[]): Promise<Set<string>> {
  const start = isoStart(weekDates[0]!);
  const end = isoEnd(weekDates[weekDates.length - 1]!);
  return new Promise(resolve => {
    const native = getHealthNative();
    if (!native) { resolve(new Set()); return; }
    native.getWaterSamples(
      { startDate: start, endDate: end, unit: 'ml' } as any,
      (err: any, results: any[]) => {
        if (err || !results) { resolve(new Set()); return; }
        const days = new Set(results.map(r => r.startDate.slice(0, 10)));
        resolve(days);
      },
    );
  });
}

export async function readMindfulDays(weekDates: string[]): Promise<Set<string>> {
  const start = isoStart(weekDates[0]!);
  const end = isoEnd(weekDates[weekDates.length - 1]!);
  return new Promise(resolve => {
    const native = getHealthNative();
    if (!native) { resolve(new Set()); return; }
    native.getMindfulSession(
      { startDate: start, endDate: end } as any,
      (err: any, results: any[]) => {
        if (err || !results) { resolve(new Set()); return; }
        const days = new Set(results.map(r => r.startDate.slice(0, 10)));
        resolve(days);
      },
    );
  });
}

export async function readStepDays(weekDates: string[], stepGoal: number): Promise<Set<string>> {
  const start = isoStart(weekDates[0]!);
  const end = isoEnd(weekDates[weekDates.length - 1]!);
  return new Promise(resolve => {
    const native = getHealthNative();
    if (!native) { resolve(new Set()); return; }
    native.getDailyStepCountSamples(
      { startDate: start, endDate: end, includeManuallyAdded: false } as any,
      (err: any, results: any[]) => {
        if (err || !results) { resolve(new Set()); return; }
        const days = new Set<string>(
          results
            .filter(r => r.value >= stepGoal)
            .map(r => r.startDate.slice(0, 10))
            .filter(d => weekDates.includes(d)),
        );
        resolve(days);
      },
    );
  });
}

/**
 * Bind-time default for a steps mark's stepGoal (health-auto-sync T1): the
 * user's 30-day average daily steps. Averages the daily totals HealthKit
 * reports (days with no samples do not dilute the average). Null — not a
 * throw, matching every reader's quiet-empty contract — when the module is
 * unavailable, the read errors, or Health has no step history; the caller
 * falls back to 8000.
 */
export async function readAverageDailySteps(): Promise<number | null> {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  start.setHours(0, 0, 0, 0);
  return new Promise(resolve => {
    const native = getHealthNative();
    if (!native) { resolve(null); return; }
    native.getDailyStepCountSamples(
      { startDate: start.toISOString(), endDate: end.toISOString(), includeManuallyAdded: false } as any,
      (err: any, results: any[]) => {
        if (err || !results || results.length === 0) { resolve(null); return; }
        const total = results.reduce(
          (sum, r) => sum + (typeof r.value === 'number' ? r.value : 0),
          0,
        );
        resolve(total / results.length);
      },
    );
  });
}

/**
 * Auto-sync's duration-based sleep qualification (health-auto-sync T2): a day
 * qualifies only when the TOTAL asleep duration inside its night window
 * (20:00 previous day → 10:00) reaches sleepHours. Wake-date attribution and
 * the AWAKE/INBED skip mirror readSleepDays — which stays lenient on purpose:
 * the reflection tier keeps counting any asleep sample; only auto-sync uses
 * this threshold.
 *
 * Overlap handling: each sample is clamped to its wake-day's night window,
 * then per-day intervals are sorted and MERGED before summing, so overlapping
 * samples (e.g. Watch + phone both recording) can never double-count a short
 * night past the threshold.
 */
export async function readSleepQualifiedDays(
  weekDates: string[],
  sleepHours: number,
): Promise<Set<string>> {
  const start = new Date(`${weekDates[0]!}T00:00:00`);
  start.setDate(start.getDate() - 1);
  start.setHours(20, 0, 0, 0);
  const end = new Date(`${weekDates[weekDates.length - 1]!}T10:00:00`);

  return new Promise(resolve => {
    const native = getHealthNative();
    if (!native) { resolve(new Set()); return; }
    native.getSleepSamples(
      { startDate: start.toISOString(), endDate: end.toISOString() } as any,
      (err: any, results: any[]) => {
        if (err || !results) { resolve(new Set()); return; }
        const intervalsByDay = new Map<string, [number, number][]>();
        for (const sample of results) {
          if (sample.value === 'AWAKE' || sample.value === 'INBED') continue;
          const wakeDate = sample.endDate?.slice(0, 10);
          if (!wakeDate || !weekDates.includes(wakeDate)) continue;
          const windowStart = new Date(`${wakeDate}T00:00:00`);
          windowStart.setDate(windowStart.getDate() - 1);
          windowStart.setHours(20, 0, 0, 0);
          const windowEnd = new Date(`${wakeDate}T10:00:00`).getTime();
          const clampedStart = Math.max(new Date(sample.startDate).getTime(), windowStart.getTime());
          const clampedEnd = Math.min(new Date(sample.endDate).getTime(), windowEnd);
          if (!(clampedEnd > clampedStart)) continue;
          const list = intervalsByDay.get(wakeDate) ?? [];
          list.push([clampedStart, clampedEnd]);
          intervalsByDay.set(wakeDate, list);
        }
        const thresholdMs = sleepHours * 3_600_000;
        const days = new Set<string>();
        for (const [day, intervals] of intervalsByDay) {
          intervals.sort((a, b) => a[0] - b[0]);
          let total = 0;
          let mergedStart = intervals[0]![0];
          let mergedEnd = intervals[0]![1];
          for (let i = 1; i < intervals.length; i++) {
            const [s, e] = intervals[i]!;
            if (s <= mergedEnd) {
              mergedEnd = Math.max(mergedEnd, e);
            } else {
              total += mergedEnd - mergedStart;
              mergedStart = s;
              mergedEnd = e;
            }
          }
          total += mergedEnd - mergedStart;
          if (total >= thresholdMs) days.add(day);
        }
        resolve(days);
      },
    );
  });
}

export async function readRunningDays(weekDates: string[]): Promise<Set<string>> {
  const start = isoStart(weekDates[0]!);
  const end = isoEnd(weekDates[weekDates.length - 1]!);
  return new Promise(resolve => {
    const native = getHealthNative();
    if (!native) { resolve(new Set()); return; }
    native.getSamples(
      { startDate: start, endDate: end, type: 'Running' } as any,
      (err: any, results: any[]) => {
        if (err || !results) { resolve(new Set()); return; }
        const days = new Set(results.map(r => r.startDate.slice(0, 10)));
        resolve(days);
      },
    );
  });
}

export async function readHealthDays(
  type: HealthKitType,
  weekDates: string[],
  config?: { stepGoal?: number; sleepHours?: number },
): Promise<Set<string>> {
  switch (type) {
    case 'workout':   return readWorkoutDays(weekDates);
    case 'sleep':     return readSleepDays(weekDates);
    case 'hydration': return readHydrationDays(weekDates);
    case 'mindful':   return readMindfulDays(weekDates);
    case 'steps':     return readStepDays(weekDates, config?.stepGoal ?? STEP_GOAL_FALLBACK);
    case 'running':   return readRunningDays(weekDates);
  }
}
