import AppleHealthKit from 'react-native-health';
import type { HealthKitType } from './healthTypes';

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
    AppleHealthKit.getSamples(
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
    AppleHealthKit.getSleepSamples(
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
    AppleHealthKit.getWaterSamples(
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
    AppleHealthKit.getMindfulSession(
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
    AppleHealthKit.getDailyStepCountSamples(
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

export async function readRunningDays(weekDates: string[]): Promise<Set<string>> {
  const start = isoStart(weekDates[0]!);
  const end = isoEnd(weekDates[weekDates.length - 1]!);
  return new Promise(resolve => {
    AppleHealthKit.getSamples(
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
  config?: { stepGoal?: number },
): Promise<Set<string>> {
  switch (type) {
    case 'workout':   return readWorkoutDays(weekDates);
    case 'sleep':     return readSleepDays(weekDates);
    case 'hydration': return readHydrationDays(weekDates);
    case 'mindful':   return readMindfulDays(weekDates);
    case 'steps':     return readStepDays(weekDates, config?.stepGoal ?? 8000);
    case 'running':   return readRunningDays(weekDates);
  }
}
