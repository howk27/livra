// Health auto-sync engine (health-auto-sync T3, spec §2/§6).
//
// The engine is pure-as-possible: gates, bindings, logged amounts, daily
// targets and the check-in writer are all injected, so every contract here runs
// with no React, no network and no native module. The HealthKit readers are
// injectable too; one test pins the DEFAULT wiring (sleep goes through the
// duration-threshold read, never the lenient reflection read).

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  HEALTH_AUTO_SYNC_STATE_KEY,
  computeSyncWindow,
  getAutoSyncState,
  recordHealthConnectDay,
  runAutoSync,
  buildAutoSyncCheckinRow,
  type AutoSyncWriteRequest,
  type RunAutoSyncOptions,
} from '../../../lib/health/autoSync';
import { markWeeklyState, computeCompletionsThisWeek } from '../../../lib/features';
import type { HealthKitBinding } from '../../../lib/health/healthKitBinding';
import type { MarkEvent } from '../../../types';

jest.mock('../../../lib/health/healthReader');
/* eslint-disable-next-line import/first */
import * as healthReader from '../../../lib/health/healthReader';

const USER = '3fe1a23e-2ec2-4830-a68b-42b65fc3bcb0';
const MARK = 'a1b2c3d4-1111-4222-8333-444455556666';
const MARK2 = 'b2c3d4e5-2222-4333-8444-555566667777';
const TODAY = '2026-08-05';

const emptySet = async () => new Set<string>();

beforeEach(async () => {
  await AsyncStorage.removeItem(HEALTH_AUTO_SYNC_STATE_KEY);
  for (const fn of [
    'readWorkoutDays',
    'readRunningDays',
    'readMindfulDays',
    'readStepDays',
    'readSleepQualifiedDays',
  ] as const) {
    (healthReader[fn] as jest.Mock).mockReset().mockImplementation(emptySet);
  }
});

// ─── The window (spec §2.3, acceptance 3) ────────────────────────────────────

describe('computeSyncWindow', () => {
  it('caps catch-up at 7 days (today − 6 … today)', () => {
    expect(
      computeSyncWindow({ today: TODAY, connectDay: '2026-07-01', lastSyncedDay: null }),
    ).toEqual([
      '2026-07-30',
      '2026-07-31',
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
    ]);
  });

  it('floors at the connect day — pre-connect days never enter the window', () => {
    expect(
      computeSyncWindow({ today: TODAY, connectDay: '2026-08-03', lastSyncedDay: null }),
    ).toEqual(['2026-08-03', '2026-08-04', '2026-08-05']);
  });

  it('starts the day after the watermark', () => {
    expect(
      computeSyncWindow({ today: TODAY, connectDay: '2026-07-01', lastSyncedDay: '2026-08-03' }),
    ).toEqual(['2026-08-04', '2026-08-05']);
  });

  it('always re-scans today: a watermark at yesterday leaves [today]', () => {
    expect(
      computeSyncWindow({ today: TODAY, connectDay: '2026-07-01', lastSyncedDay: '2026-08-04' }),
    ).toEqual(['2026-08-05']);
  });

  it('is empty without a connect day (never connected → nothing to scan)', () => {
    expect(computeSyncWindow({ today: TODAY, connectDay: null, lastSyncedDay: null })).toEqual([]);
  });

  it('is empty when the connect day is in the future of today (clock skew)', () => {
    expect(
      computeSyncWindow({ today: TODAY, connectDay: '2026-08-06', lastSyncedDay: null }),
    ).toEqual([]);
  });

  it('connect-day == today yields exactly [today] (forward-only from connect)', () => {
    expect(
      computeSyncWindow({ today: TODAY, connectDay: TODAY, lastSyncedDay: null }),
    ).toEqual([TODAY]);
  });
});

// ─── State storage ───────────────────────────────────────────────────────────

describe('auto-sync state (AsyncStorage)', () => {
  it('recordHealthConnectDay is first-write-wins', async () => {
    await recordHealthConnectDay('2026-08-01');
    await recordHealthConnectDay('2026-08-04');
    expect((await getAutoSyncState()).connectDay).toBe('2026-08-01');
  });

  it('starts empty and survives a corrupt blob quietly', async () => {
    await AsyncStorage.setItem(HEALTH_AUTO_SYNC_STATE_KEY, 'not json');
    expect(await getAutoSyncState()).toEqual({ connectDay: null, lastSyncedDay: null });
  });
});

// ─── The engine ──────────────────────────────────────────────────────────────

type Overrides = Partial<RunAutoSyncOptions>;

function makeOpts(overrides: Overrides = {}): RunAutoSyncOptions {
  const writes: AutoSyncWriteRequest[] = [];
  return {
    userId: USER,
    gates: { isPro: true, healthConnected: true, autoSyncEnabled: true },
    bindings: { [MARK]: { type: 'workout', config: null } },
    loggedAmount: () => 0,
    dailyTarget: () => 1,
    writeCheckin: async (req) => {
      writes.push(req);
    },
    today: TODAY,
    readers: {
      workout: emptySet,
      running: emptySet,
      mindful: emptySet,
      steps: emptySet,
      sleep: emptySet,
    },
    ...overrides,
  };
}

describe('runAutoSync — gates (acceptance 1, 6)', () => {
  it.each([
    ['free tier', { isPro: false, healthConnected: true, autoSyncEnabled: true }],
    ['health not connected', { isPro: true, healthConnected: false, autoSyncEnabled: true }],
    ['toggle off', { isPro: true, healthConnected: true, autoSyncEnabled: false }],
  ])('is a no-op when %s — no writes, no storage', async (_label, gates) => {
    const writeCheckin = jest.fn();
    const result = await runAutoSync(makeOpts({ gates, writeCheckin }));
    expect(result.ran).toBe(false);
    expect(result.reason).toBe('gates');
    expect(writeCheckin).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(HEALTH_AUTO_SYNC_STATE_KEY)).toBeNull();
  });

  it('is a no-op when signed out (empty userId)', async () => {
    const result = await runAutoSync(makeOpts({ userId: '' }));
    expect(result.ran).toBe(false);
    expect(result.reason).toBe('gates');
  });

  it('is a no-op when the bindings map is empty', async () => {
    const result = await runAutoSync(makeOpts({ bindings: {} }));
    expect(result.ran).toBe(false);
    expect(result.reason).toBe('no-bindings');
    expect(await AsyncStorage.getItem(HEALTH_AUTO_SYNC_STATE_KEY)).toBeNull();
  });

  it('skips hydration bindings — a water sample must not close a multi-tap day', async () => {
    const result = await runAutoSync(
      makeOpts({ bindings: { [MARK]: { type: 'hydration', config: null } } }),
    );
    expect(result.ran).toBe(false);
    expect(result.reason).toBe('no-bindings');
  });
});

describe('runAutoSync — qualification and writes (acceptance 2)', () => {
  it('a qualifying past day writes one quiet closing check-in; today speaks', async () => {
    await recordHealthConnectDay('2026-08-01');
    const opts = makeOpts({
      readers: { ...makeOpts().readers, workout: async () => new Set(['2026-08-04', TODAY]) },
    });
    const result = await runAutoSync(opts);
    expect(result.writes).toEqual([
      { markId: MARK, day: '2026-08-04', amount: 1, quiet: true, source: 'health' },
      { markId: MARK, day: TODAY, amount: 1, quiet: false, source: 'health' },
    ]);
  });

  it('an already-closed day is never touched (manual truth wins)', async () => {
    await recordHealthConnectDay('2026-08-01');
    const opts = makeOpts({
      loggedAmount: (_m, day) => (day === '2026-08-04' ? 1 : 0),
      readers: { ...makeOpts().readers, workout: async () => new Set(['2026-08-04']) },
    });
    const result = await runAutoSync(opts);
    expect(result.writes).toEqual([]);
  });

  it('a partially tapped day is topped up to closed, not double-logged', async () => {
    await recordHealthConnectDay('2026-08-01');
    const opts = makeOpts({
      dailyTarget: () => 3,
      loggedAmount: (_m, day) => (day === '2026-08-04' ? 1 : 0),
      readers: { ...makeOpts().readers, workout: async () => new Set(['2026-08-04']) },
    });
    const result = await runAutoSync(opts);
    expect(result.writes).toEqual([
      { markId: MARK, day: '2026-08-04', amount: 2, quiet: true, source: 'health' },
    ]);
  });

  it('double-run writes nothing new (day-level idempotence)', async () => {
    await recordHealthConnectDay('2026-08-01');
    const logged = new Map<string, number>();
    const opts = makeOpts({
      loggedAmount: (markId, day) => logged.get(`${markId}|${day}`) ?? 0,
      writeCheckin: async (req) => {
        const key = `${req.markId}|${req.day}`;
        logged.set(key, (logged.get(key) ?? 0) + req.amount);
      },
      readers: { ...makeOpts().readers, workout: async () => new Set(['2026-08-03', TODAY]) },
    });
    const first = await runAutoSync(opts);
    expect(first.writes).toHaveLength(2);
    const second = await runAutoSync(opts);
    expect(second.writes).toEqual([]);
  });

  it('a same-day re-run after a MANUAL log cannot double-log today', async () => {
    await recordHealthConnectDay('2026-08-01');
    const opts = makeOpts({
      loggedAmount: (_m, day) => (day === TODAY ? 1 : 0), // the user tapped today
      readers: { ...makeOpts().readers, workout: async () => new Set([TODAY]) },
    });
    const result = await runAutoSync(opts);
    expect(result.writes).toEqual([]);
  });
});

describe('runAutoSync — per-type qualification wiring (acceptance 2, 5)', () => {
  it('steps qualifies via config.stepGoal; sleep via readSleepQualifiedDays with sleepHours', async () => {
    await recordHealthConnectDay('2026-08-01');
    const steps = jest.fn(async () => new Set(['2026-08-04']));
    const sleep = jest.fn(async () => new Set(['2026-08-03']));
    const result = await runAutoSync(
      makeOpts({
        bindings: {
          [MARK]: { type: 'steps', config: { stepGoal: 9500 } },
          [MARK2]: { type: 'sleep', config: { sleepHours: 8 } },
        },
        readers: { ...makeOpts().readers, steps, sleep },
      }),
    );
    expect(steps).toHaveBeenCalledWith(expect.any(Array), 9500);
    expect(sleep).toHaveBeenCalledWith(expect.any(Array), 8);
    expect(result.writes.map((w) => w.markId).sort()).toEqual([MARK, MARK2].sort());
  });

  it('falls back to 8000 steps / 7h sleep when a binding has no config', async () => {
    await recordHealthConnectDay('2026-08-01');
    const steps = jest.fn(emptySet);
    const sleep = jest.fn(emptySet);
    await runAutoSync(
      makeOpts({
        bindings: {
          [MARK]: { type: 'steps', config: null },
          [MARK2]: { type: 'sleep', config: null },
        },
        readers: { ...makeOpts().readers, steps, sleep },
      }),
    );
    expect(steps).toHaveBeenCalledWith(expect.any(Array), 8000);
    expect(sleep).toHaveBeenCalledWith(expect.any(Array), 7);
  });

  it('DEFAULT sleep wiring is the duration-threshold read, not the lenient reflection read', async () => {
    await recordHealthConnectDay('2026-08-01');
    (healthReader.readSleepQualifiedDays as jest.Mock).mockResolvedValue(new Set());
    await runAutoSync(
      makeOpts({
        bindings: { [MARK]: { type: 'sleep', config: { sleepHours: 7 } } },
        readers: undefined, // the module defaults
      }),
    );
    expect(healthReader.readSleepQualifiedDays).toHaveBeenCalledWith(expect.any(Array), 7);
    expect(healthReader.readSleepDays).not.toHaveBeenCalled();
  });
});

describe('runAutoSync — watermark + connect day (acceptance 1, 2, 3)', () => {
  it('stamps a missing connect day at first run (forward-only for pre-2.0 connections)', async () => {
    await runAutoSync(makeOpts());
    expect((await getAutoSyncState()).connectDay).toBe(TODAY);
  });

  it('advances the watermark to YESTERDAY so today stays re-scannable', async () => {
    await recordHealthConnectDay('2026-08-01');
    await runAutoSync(makeOpts());
    expect((await getAutoSyncState()).lastSyncedDay).toBe('2026-08-04');
  });

  it('a failed write leaves the watermark untouched so the day retries next run', async () => {
    await recordHealthConnectDay('2026-08-01');
    const result = await runAutoSync(
      makeOpts({
        readers: { ...makeOpts().readers, workout: async () => new Set(['2026-08-03']) },
        writeCheckin: async () => {
          throw new Error('offline write path exploded');
        },
      }),
    );
    expect(result.writeFailed).toBe(true);
    expect((await getAutoSyncState()).lastSyncedDay).toBeNull();
  });

  it('never moves the watermark backwards', async () => {
    await recordHealthConnectDay('2026-08-01');
    await runAutoSync(makeOpts({ today: '2026-08-05' }));
    await runAutoSync(makeOpts({ today: '2026-08-03' })); // clock went backwards
    expect((await getAutoSyncState()).lastSyncedDay).toBe('2026-08-04');
  });
});

// ─── The catch-up row itself ─────────────────────────────────────────────────

describe('buildAutoSyncCheckinRow (real write path, attribution)', () => {
  it('past days are dated at that day, noon local, with source health', () => {
    const row = buildAutoSyncCheckinRow({
      markId: MARK,
      userId: USER,
      day: '2026-08-03',
      amount: 2,
      today: TODAY,
    });
    expect(row.occurred_local_date).toBe('2026-08-03');
    expect(row.amount).toBe(2);
    expect(row.event_type).toBe('increment');
    expect(row.source).toBe('health');
  });

  it("today's row carries today's local date", () => {
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
      today.getDate(),
    ).padStart(2, '0')}`;
    const row = buildAutoSyncCheckinRow({
      markId: MARK,
      userId: USER,
      day: iso,
      amount: 1,
      today: iso,
    });
    expect(row.occurred_local_date).toBe(iso);
    expect(row.source).toBe('health');
  });
});

// ─── WEEK-CREDIT PIN (acceptance 7 — mandatory) ─────────────────────────────
//
// Past-dated writes touch week credit, the family with this repo's worst
// regression history. Week credit is DERIVED (computeCompletionsThisWeek →
// markWeeklyState), so the observable contract is: an auto-sync catch-up
// landing in an already-credited week can only INCREASE the completion count —
// 'doneForWeek' can never flip back to 'due', and other weeks are untouched.

describe('week-credit pin: a catch-up day in a credited week never reopens it', () => {
  const WEEK = [
    '2026-08-03',
    '2026-08-04',
    '2026-08-05',
    '2026-08-06',
    '2026-08-07',
    '2026-08-08',
    '2026-08-09',
  ];
  const PRIOR_WEEK = [
    '2026-07-27',
    '2026-07-28',
    '2026-07-29',
    '2026-07-30',
    '2026-07-31',
    '2026-08-01',
    '2026-08-02',
  ];

  function manualEvent(day: string, amount = 1): MarkEvent {
    return {
      id: `manual-${day}`,
      user_id: USER,
      mark_id: MARK,
      event_type: 'increment',
      amount,
      occurred_at: `${day}T09:00:00.000Z`,
      occurred_local_date: day,
      deleted_at: null,
      created_at: `${day}T09:00:00.000Z`,
      updated_at: `${day}T09:00:00.000Z`,
    } as MarkEvent;
  }

  it('credited week stays doneForWeek; the count only grows; prior week untouched', async () => {
    const mark = { id: MARK, dailyTarget: 1, weekly_target: 2, frequency_kind: null };
    // Monday and Wednesday closed by hand → 2 of 2, week credited.
    const events: MarkEvent[] = [
      manualEvent('2026-08-03'),
      manualEvent(TODAY),
      manualEvent('2026-08-01'), // prior week, 1 completion
    ];
    const before = computeCompletionsThisWeek(mark, events, WEEK);
    expect(markWeeklyState(mark, before)).toBe('doneForWeek');
    const priorBefore = computeCompletionsThisWeek(mark, events, PRIOR_WEEK);

    // Health qualifies Tuesday (unclosed) — the engine writes the catch-up.
    await recordHealthConnectDay('2026-08-01');
    const loggedByDay = new Map(events.map((e) => [e.occurred_local_date, e.amount ?? 1]));
    const result = await runAutoSync(
      makeOpts({
        loggedAmount: (_m, day) => loggedByDay.get(day) ?? 0,
        readers: { ...makeOpts().readers, workout: async () => new Set(['2026-08-04']) },
      }),
    );
    expect(result.writes).toEqual([
      { markId: MARK, day: '2026-08-04', amount: 1, quiet: true, source: 'health' },
    ]);

    // Materialise the write exactly as the real path would and re-derive.
    for (const w of result.writes) {
      const row = buildAutoSyncCheckinRow({ ...w, userId: USER, today: TODAY });
      events.push({ ...row, amount: row.amount ?? 1 } as unknown as MarkEvent);
    }
    const after = computeCompletionsThisWeek(mark, events, WEEK);
    expect(after).toBe(before + 1); // monotonic — credit can only accrue
    expect(markWeeklyState(mark, after)).toBe('doneForWeek'); // never reopened
    expect(computeCompletionsThisWeek(mark, events, PRIOR_WEEK)).toBe(priorBefore);
  });
});
