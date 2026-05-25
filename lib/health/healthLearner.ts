import AppleHealthKit from 'react-native-health';

export function roundToNearest(value: number, multiple: number): number {
  return Math.round(value / multiple) * multiple;
}

export function computeStepGoal(dailyStepCounts: number[]): number | null {
  if (dailyStepCounts.length === 0) return null;
  const avg = dailyStepCounts.reduce((a, b) => a + b, 0) / dailyStepCounts.length;
  return roundToNearest(avg * 0.8, 500);
}

export function computeMedianWakeTime(wakeTimes: string[]): string | null {
  if (wakeTimes.length === 0) return null;
  const minutes = wakeTimes
    .map(t => {
      const [h = '0', m = '0'] = t.split(':');
      return parseInt(h, 10) * 60 + parseInt(m, 10);
    })
    .sort((a, b) => a - b);
  const mid = Math.floor(minutes.length / 2);
  const median = minutes.length % 2 === 0
    ? Math.round((minutes[mid - 1]! + minutes[mid]!) / 2)
    : minutes[mid]!;
  const h = Math.floor(median / 60).toString().padStart(2, '0');
  const m = (median % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

export async function suggestStepGoal(): Promise<number | null> {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 30);

  return new Promise(resolve => {
    AppleHealthKit.getDailyStepCountSamples(
      { startDate: start.toISOString(), endDate: end.toISOString(), includeManuallyAdded: false } as any,
      (err: any, results: any[]) => {
        if (err || !results || results.length === 0) { resolve(null); return; }
        resolve(computeStepGoal(results.map(r => r.value as number)));
      },
    );
  });
}

export async function suggestWakeTime(): Promise<string | null> {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 14);

  return new Promise(resolve => {
    AppleHealthKit.getSleepSamples(
      { startDate: start.toISOString(), endDate: end.toISOString() } as any,
      (err: any, results: any[]) => {
        if (err || !results || results.length === 0) { resolve(null); return; }
        const wakeTimes = results
          .filter((r: any) => r.value !== 'AWAKE' && r.value !== 'INBED' && r.endDate)
          .map((r: any) => {
            const d = new Date(r.endDate as string);
            const h = d.getHours().toString().padStart(2, '0');
            const m = d.getMinutes().toString().padStart(2, '0');
            return `${h}:${m}`;
          });
        resolve(computeMedianWakeTime(wakeTimes));
      },
    );
  });
}
