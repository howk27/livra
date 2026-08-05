// T1/T2 (health-auto-sync): readAverageDailySteps (bind-time step-goal default)
// and readSleepQualifiedDays (duration-threshold sleep qualification for
// auto-sync). The reflection tier's lenient readSleepDays is pinned unchanged.
import {
  readAverageDailySteps,
  readSleepDays,
  readSleepQualifiedDays,
} from '../../../lib/health/healthReader';
import { getHealthNative } from '../../../lib/health/healthNative';

jest.mock('../../../lib/health/healthNative', () => ({
  getHealthNative: jest.fn(),
}));

const mockNative = getHealthNative as jest.Mock;

beforeEach(() => {
  mockNative.mockReset();
});

function nativeWithDailySteps(err: unknown, results: unknown) {
  const getDailyStepCountSamples = jest.fn((_opts: unknown, cb: (e: unknown, r: unknown) => void) =>
    cb(err, results),
  );
  mockNative.mockReturnValue({ getDailyStepCountSamples });
  return getDailyStepCountSamples;
}

function nativeWithSleep(err: unknown, results: unknown) {
  const getSleepSamples = jest.fn((_opts: unknown, cb: (e: unknown, r: unknown) => void) =>
    cb(err, results),
  );
  mockNative.mockReturnValue({ getSleepSamples });
  return getSleepSamples;
}

describe('readAverageDailySteps', () => {
  it('averages the daily totals HealthKit reports', async () => {
    nativeWithDailySteps(null, [
      { startDate: '2026-07-10T00:00:00', value: 8000 },
      { startDate: '2026-07-11T00:00:00', value: 10000 },
      { startDate: '2026-07-12T00:00:00', value: 9000 },
    ]);
    await expect(readAverageDailySteps()).resolves.toBe(9000);
  });

  it('asks for a ~30-day window and excludes manually added samples', async () => {
    const spy = nativeWithDailySteps(null, [{ startDate: '2026-07-10T00:00:00', value: 100 }]);
    await readAverageDailySteps();
    const opts = spy.mock.calls[0]![0] as {
      startDate: string;
      endDate: string;
      includeManuallyAdded: boolean;
    };
    expect(opts.includeManuallyAdded).toBe(false);
    const spanDays =
      (new Date(opts.endDate).getTime() - new Date(opts.startDate).getTime()) / 86_400_000;
    expect(spanDays).toBeGreaterThanOrEqual(29);
    expect(spanDays).toBeLessThanOrEqual(31);
  });

  it('returns null when Health has no step history', async () => {
    nativeWithDailySteps(null, []);
    await expect(readAverageDailySteps()).resolves.toBeNull();
  });

  it('returns null on a reader error (quiet-empty contract)', async () => {
    nativeWithDailySteps(new Error('denied'), null);
    await expect(readAverageDailySteps()).resolves.toBeNull();
  });

  it('returns null when the native module is unavailable', async () => {
    mockNative.mockReturnValue(null);
    await expect(readAverageDailySteps()).resolves.toBeNull();
  });
});

describe('readSleepQualifiedDays', () => {
  const WEEK = ['2026-08-03', '2026-08-04'];

  it('qualifies a day when summed asleep samples reach the threshold', async () => {
    nativeWithSleep(null, [
      { value: 'ASLEEP', startDate: '2026-08-03T23:00:00', endDate: '2026-08-04T03:00:00' },
      { value: 'ASLEEP', startDate: '2026-08-04T03:10:00', endDate: '2026-08-04T07:40:00' },
    ]);
    await expect(readSleepQualifiedDays(WEEK, 7)).resolves.toEqual(new Set(['2026-08-04']));
  });

  it('merges overlapping samples so double-counted overlap cannot qualify a short night', async () => {
    // Raw sum 4h + 3.5h = 7.5h, but the union is only 4h — must NOT qualify at 7h.
    nativeWithSleep(null, [
      { value: 'ASLEEP', startDate: '2026-08-04T00:00:00', endDate: '2026-08-04T04:00:00' },
      { value: 'ASLEEP', startDate: '2026-08-04T00:30:00', endDate: '2026-08-04T04:00:00' },
    ]);
    await expect(readSleepQualifiedDays(WEEK, 7)).resolves.toEqual(new Set());
  });

  it('ignores AWAKE and INBED samples when summing', async () => {
    nativeWithSleep(null, [
      { value: 'ASLEEP', startDate: '2026-08-03T23:00:00', endDate: '2026-08-04T05:00:00' },
      { value: 'INBED', startDate: '2026-08-04T05:00:00', endDate: '2026-08-04T09:00:00' },
    ]);
    await expect(readSleepQualifiedDays(WEEK, 7)).resolves.toEqual(new Set());
  });

  it('clamps samples to the 20:00-previous-day → 10:00 night window', async () => {
    // Raw 8h (19:00 → 03:00) but only 7h falls inside the window.
    nativeWithSleep(null, [
      { value: 'ASLEEP', startDate: '2026-08-02T19:00:00', endDate: '2026-08-03T03:00:00' },
    ]);
    await expect(readSleepQualifiedDays(WEEK, 7)).resolves.toEqual(new Set(['2026-08-03']));
    await expect(readSleepQualifiedDays(WEEK, 7.5)).resolves.toEqual(new Set());
  });

  it('attributes by wake date and ignores days outside weekDates', async () => {
    nativeWithSleep(null, [
      { value: 'ASLEEP', startDate: '2026-08-01T22:00:00', endDate: '2026-08-02T08:00:00' },
    ]);
    await expect(readSleepQualifiedDays(WEEK, 7)).resolves.toEqual(new Set());
  });

  it('returns the quiet empty set on error or missing native module', async () => {
    nativeWithSleep(new Error('denied'), null);
    await expect(readSleepQualifiedDays(WEEK, 7)).resolves.toEqual(new Set());
    mockNative.mockReturnValue(null);
    await expect(readSleepQualifiedDays(WEEK, 7)).resolves.toEqual(new Set());
  });

  it('leaves the reflection tier lenient: readSleepDays still counts a 5-minute nap day', async () => {
    nativeWithSleep(null, [
      { value: 'ASLEEP', startDate: '2026-08-04T02:00:00', endDate: '2026-08-04T02:05:00' },
    ]);
    await expect(readSleepDays(WEEK)).resolves.toEqual(new Set(['2026-08-04']));
    nativeWithSleep(null, [
      { value: 'ASLEEP', startDate: '2026-08-04T02:00:00', endDate: '2026-08-04T02:05:00' },
    ]);
    await expect(readSleepQualifiedDays(WEEK, 7)).resolves.toEqual(new Set());
  });
});
