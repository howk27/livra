// Health auto-sync trigger wiring (T4, spec §2.2 trigger, §2.7 voice, §6.1/§6.6).
//
// The engine (lib/health/autoSync.ts) is T3's; what is under test HERE is the
// caller: the 15-minute debounce, the gates read fresh on EVERY run (so a Pro
// expiry mid-lifecycle stops the next run without touching bindings), the write
// path (buildAutoSyncCheckinRow → the injected mutation), and the voice rule —
// today's write runs the manual log's speaking chain, catch-up writes stay
// quiet while credit still lands.
//
// `attemptHealthAutoSync` is the hook's whole body minus React: the hook only
// mounts AppState/launch triggers around it, so these tests need no renderer.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient } from '@tanstack/react-query';

jest.mock('../../../lib/health/healthReader');
jest.mock('../../../lib/iap/iap', () => ({ checkProStatus: jest.fn() }));
jest.mock('../../../lib/analytics/posthog', () => ({ capture: jest.fn() }));
jest.mock('../../../lib/moments/postLogVoice', () => ({
  maybeShowPostLogVoice: jest.fn(() => true),
}));
jest.mock('../../../lib/goals/goalLifecycle', () => ({
  creditMarkToGoals: jest.fn(async () => {}),
}));
jest.mock('../../../services/momentumWarningNotifications', () => ({
  reconcileMomentumWarnings: jest.fn(async () => {}),
}));

/* eslint-disable import/first */
import { checkProStatus } from '../../../lib/iap/iap';
import { capture } from '../../../lib/analytics/posthog';
import { maybeShowPostLogVoice } from '../../../lib/moments/postLogVoice';
import { creditMarkToGoals } from '../../../lib/goals/goalLifecycle';
import {
  AUTO_SYNC_DEBOUNCE_MS,
  attemptHealthAutoSync,
  __resetHealthAutoSyncForTests,
  type HealthAutoSyncContext,
} from '../../../hooks/useHealthAutoSync';
import { HEALTH_AUTO_SYNC_STATE_KEY, recordHealthConnectDay } from '../../../lib/health/autoSync';
import {
  HEALTH_KIT_BINDINGS_KEY,
  allHealthKitBindings,
} from '../../../lib/health/healthKitBinding';
import {
  HEALTH_AUTO_SYNC_ENABLED_KEY,
  useAutoSyncSettings,
  __resetAutoSyncSettingsForTests,
} from '../../../lib/health/autoSyncSettings';
import { ANALYTICS_EVENTS } from '../../../lib/analytics/events';
import { useUIStore } from '../../../state/uiSlice';
import { queryKeys } from '../../../lib/data/queryKeys';
import { formatDate } from '../../../lib/date';
import { getAppDate } from '../../../lib/appDate';
import type { MarkEventRow } from '../../../lib/data/types';
/* eslint-enable import/first */

const USER = '3fe1a23e-2ec2-4830-a68b-42b65fc3bcb0';
const MARK = 'a1b2c3d4-1111-4222-8333-444455556666';

const TODAY = formatDate(getAppDate());
function daysAgo(n: number): string {
  const d = getAppDate();
  d.setDate(d.getDate() - n);
  return formatDate(d);
}

const emptySet = async () => new Set<string>();
const emptyReaders = {
  workout: emptySet,
  running: emptySet,
  mindful: emptySet,
  steps: emptySet,
  sleep: emptySet,
};

let nowMs: number;

function makeCtx(over: Partial<HealthAutoSyncContext> = {}): {
  ctx: HealthAutoSyncContext;
  logged: MarkEventRow[];
  badges: jest.Mock;
} {
  // gcTime Infinity: setQueryData otherwise arms a 5-minute GC timer per query,
  // which Jest reports as a leaked handle after the suite ends.
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  client.setQueryData(queryKeys.marks(USER), [
    { id: MARK, user_id: USER, name: 'Run', dailyTarget: 1 },
  ]);
  const logged: MarkEventRow[] = [];
  const badges = jest.fn(async () => []);
  const ctx: HealthAutoSyncContext = {
    userId: USER,
    client,
    logRow: async (row) => {
      logged.push(row as MarkEventRow);
    },
    evaluateMarkBadges: badges,
    firstName: 'Deivi',
    now: () => nowMs,
    readers: emptyReaders,
    ...over,
  };
  return { ctx, logged, badges };
}

beforeEach(async () => {
  nowMs = 1_000_000_000;
  __resetHealthAutoSyncForTests();
  __resetAutoSyncSettingsForTests();
  await AsyncStorage.removeItem(HEALTH_AUTO_SYNC_STATE_KEY);
  await AsyncStorage.removeItem(HEALTH_AUTO_SYNC_ENABLED_KEY);
  await AsyncStorage.setItem(
    HEALTH_KIT_BINDINGS_KEY,
    JSON.stringify({ [MARK]: { type: 'workout', config: null } }),
  );
  await recordHealthConnectDay(daysAgo(6));
  useUIStore.setState({ healthConnected: true });
  (checkProStatus as jest.Mock).mockReset().mockResolvedValue({ effectiveUnlocked: true });
  (capture as jest.Mock).mockClear();
  (maybeShowPostLogVoice as jest.Mock).mockClear().mockReturnValue(true);
  (creditMarkToGoals as jest.Mock).mockClear().mockResolvedValue(undefined);
});

describe('trigger debounce (spec §6.1: ≤ once per 15 minutes)', () => {
  it('runs, then refuses a second attempt inside the window, then runs again after it', async () => {
    const { ctx } = makeCtx();
    const r1 = await attemptHealthAutoSync(ctx);
    expect(r1?.ran).toBe(true);
    expect(await attemptHealthAutoSync(ctx)).toBeNull();
    nowMs += AUTO_SYNC_DEBOUNCE_MS;
    const r3 = await attemptHealthAutoSync(ctx);
    expect(r3?.ran).toBe(true);
  });

  it('a signed-out attempt neither runs nor burns the debounce window', async () => {
    const { ctx } = makeCtx({ userId: undefined });
    expect(await attemptHealthAutoSync(ctx)).toBeNull();
    const { ctx: signedIn } = makeCtx();
    expect((await attemptHealthAutoSync(signedIn))?.ran).toBe(true);
  });
});

describe('gates are read per run (spec §6.6)', () => {
  it('Pro expiry stops the NEXT run without touching bindings', async () => {
    const qualifying = async () => new Set([TODAY]);
    const { ctx, logged } = makeCtx({ readers: { ...emptyReaders, workout: qualifying } });

    const r1 = await attemptHealthAutoSync(ctx);
    expect(r1?.writes).toHaveLength(1);
    expect(logged).toHaveLength(1);

    const before = await allHealthKitBindings();
    (checkProStatus as jest.Mock).mockResolvedValue({ effectiveUnlocked: false });
    nowMs += AUTO_SYNC_DEBOUNCE_MS;

    const r2 = await attemptHealthAutoSync(ctx);
    expect(r2?.ran).toBe(false);
    expect(r2?.reason).toBe('gates');
    expect(logged).toHaveLength(1); // no new writes
    expect(await allHealthKitBindings()).toEqual(before); // bindings untouched
  });

  it('the master toggle OFF gates the run', async () => {
    await useAutoSyncSettings.getState().setAutoSyncEnabled(false);
    const { ctx } = makeCtx();
    const r = await attemptHealthAutoSync(ctx);
    expect(r?.reason).toBe('gates');
  });

  it('Health disconnected gates the run', async () => {
    useUIStore.setState({ healthConnected: false });
    const { ctx } = makeCtx();
    const r = await attemptHealthAutoSync(ctx);
    expect(r?.reason).toBe('gates');
  });
});

describe('voice (spec §2.7): today speaks, catch-up stays quiet', () => {
  it("today's write goes through the real row builder (source 'health') and speaks", async () => {
    const qualifying = async () => new Set([TODAY]);
    const { ctx, logged } = makeCtx({ readers: { ...emptyReaders, workout: qualifying } });

    const r = await attemptHealthAutoSync(ctx);
    expect(r?.writes).toEqual([
      expect.objectContaining({ markId: MARK, day: TODAY, quiet: false, source: 'health' }),
    ]);
    expect(logged[0]).toEqual(
      expect.objectContaining({
        mark_id: MARK,
        event_type: 'increment',
        occurred_local_date: TODAY,
        source: 'health',
      }),
    );
    // Speaks like a manual log: the post-log voice line and MARK_LOGGED both fire.
    expect(maybeShowPostLogVoice).toHaveBeenCalledTimes(1);
    expect((maybeShowPostLogVoice as jest.Mock).mock.calls[0][0]).toBe(MARK);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.MARK_LOGGED,
      expect.objectContaining({ mark_id: MARK, source: 'health' }),
    );
  });

  it('catch-up days land quietly: credit and badges run, voice and analytics stay silent', async () => {
    const qualifying = async () => new Set([daysAgo(1)]);
    const { ctx, logged, badges } = makeCtx({
      readers: { ...emptyReaders, workout: qualifying },
    });

    const r = await attemptHealthAutoSync(ctx);
    expect(r?.writes).toEqual([
      expect.objectContaining({ markId: MARK, day: daysAgo(1), quiet: true }),
    ]);
    expect(logged).toHaveLength(1);
    expect(maybeShowPostLogVoice).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
    // Credit still lands (spec §2.7: quiet ≠ uncredited).
    expect(creditMarkToGoals).toHaveBeenCalledWith(ctx.client, USER, MARK, expect.anything());
    expect(badges).toHaveBeenCalledWith(MARK, USER, expect.anything());
  });

  it('a run with no writes runs no post-write effects', async () => {
    const { ctx, badges } = makeCtx();
    const r = await attemptHealthAutoSync(ctx);
    expect(r?.ran).toBe(true);
    expect(r?.writes).toHaveLength(0);
    expect(creditMarkToGoals).not.toHaveBeenCalled();
    expect(badges).not.toHaveBeenCalled();
    expect(maybeShowPostLogVoice).not.toHaveBeenCalled();
  });
});
