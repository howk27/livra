/**
 * Sign-out used to clear the Supabase session and the onboarding flag and
 * nothing else, so the previous account's marks, events, goals, links, notes,
 * XP, momentum records, identity memory and widget snapshot all stayed on the
 * device for whoever signed in next (hooks/useAuth.ts, human queue 2026-07-22).
 *
 * M9 Phase 5A Task 6: the SQLite / mock-DB wipe steps are GONE with lib/db —
 * the cutover wipe removed those stores once, and no surviving code recreates
 * them. What remains under contract:
 *  1. Account-scoped keys go, device-scoped keys stay, per-goal/per-mark key
 *     FAMILIES go by prefix.
 *  2. The stores that never re-hydrate from an empty file (identity milestones,
 *     momentum's longest runs) are reset in MEMORY, or the next account
 *     inherits them and momentum writes them straight back to disk.
 *  3. A failing step never throws — a user stranded in a signed-in session is
 *     worse than a partial wipe — and the failure is reported, not swallowed.
 *  4. DRIFT GUARD: every storage-key literal in the app is classified in one of
 *     the registries. A new key cannot silently rejoin the leak.
 */

jest.mock('../../lib/widgets/widgetSync', () => ({
  syncWidgetData: jest.fn(async () => {}),
}));
jest.mock('../../lib/widgets/widgetLogQueue', () => ({
  clearPendingWidgetLogs: jest.fn(async () => {}),
}));

/* eslint-disable import/first -- jest.mock factories must precede these imports */
import fs from 'fs';
import path from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  purgeLocalUserData,
  ACCOUNT_SCOPED_STORAGE_KEYS,
  ACCOUNT_SCOPED_KEY_PREFIXES,
  DEVICE_SCOPED_STORAGE_KEYS,
  NON_ASYNC_STORAGE_LITERALS,
} from '../../lib/purgeLocalUserData';
import { useIdentityStore } from '../../state/identitySlice';
import { useMomentumStore } from '../../state/momentumSlice';
/* eslint-enable import/first */

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

describe('purgeLocalUserData — AsyncStorage', () => {
  it('removes account-scoped keys and keeps device-scoped ones', async () => {
    await AsyncStorage.multiSet([
      ['identity_milestones_v1', '{"m1":["x"]}'],
      ['profile_image_uri', 'file:///avatar.png'],
      ['last_pushed_at', '2026-07-25T00:00:00.000Z'],
      ['pro_unlocked', 'true'],
      ['theme_mode', 'dark'],
      ['biometric_lock_enabled', 'true'],
      ['@livra_migration_freq_v1', '1'],
    ]);

    const result = await purgeLocalUserData();

    expect(result.failures).toEqual([]);
    expect(await AsyncStorage.getItem('identity_milestones_v1')).toBeNull();
    expect(await AsyncStorage.getItem('profile_image_uri')).toBeNull();
    expect(await AsyncStorage.getItem('last_pushed_at')).toBeNull();
    expect(await AsyncStorage.getItem('pro_unlocked')).toBeNull();
    // Kept: display preference, device lock, and the migration flag whose loss
    // would re-run a data-shape backfill over the NEXT account's rows.
    expect(await AsyncStorage.getItem('theme_mode')).toBe('dark');
    expect(await AsyncStorage.getItem('biometric_lock_enabled')).toBe('true');
    expect(await AsyncStorage.getItem('@livra_migration_freq_v1')).toBe('1');
  });

  it('removes per-goal and per-mark key families by prefix', async () => {
    await AsyncStorage.multiSet([
      ['@livra_momentum_goal-1', '{"goalId":"goal-1"}'],
      ['@livra_reminder_time:mark-9', '08:00'],
      ['@livra_pace_notif_state:mark-9', '{}'],
      ['@livra_sleep_notif_time:mark-9', '22:00'],
    ]);

    await purgeLocalUserData();

    const left = await AsyncStorage.getAllKeys();
    expect(left.filter((k) => ACCOUNT_SCOPED_KEY_PREFIXES.some((p) => k.startsWith(p)))).toEqual([]);
  });
});

describe('purgeLocalUserData — in-memory stores', () => {
  it('clears the stores that never re-hydrate from an empty file', async () => {
    useIdentityStore.setState({ fired: { 'mark-1': ['first-week'] }, loaded: true });
    useMomentumStore.setState({
      snapshots: {},
      longestRuns: { 'goal-1': { best: 12, priorBest: 8, recordDay: null, recordRunStart: null } },
      longestRunsHydrated: true,
    });

    await purgeLocalUserData();

    expect(useIdentityStore.getState().fired).toEqual({});
    expect(useIdentityStore.getState().loaded).toBe(false);
    expect(useMomentumStore.getState().longestRuns).toEqual({});
    // Re-armed: the next account must be able to hydrate its own history.
    expect(useMomentumStore.getState().longestRunsHydrated).toBe(false);
  });

});

describe('purge — the query cache (M9 Phase 5A Task 3 Step 2)', () => {
  it('clears the in-memory query cache and sweeps its persisted key', async () => {
    const { queryClient } = require('../../lib/data/queryClient');
    queryClient.setQueryData(['livra', 'user-a', 'goals'], [{ id: 'g1' }]);
    await AsyncStorage.setItem('livra-rq-cache', '{"clientState":{}}');

    await purgeLocalUserData();

    expect(queryClient.getQueryData(['livra', 'user-a', 'goals'])).toBeUndefined();
    expect(await AsyncStorage.getItem('livra-rq-cache')).toBeNull();
    queryClient.clear();
  });
});

describe('storage-key drift guard', () => {
  // Every persisted key is account-scoped (purged) or device-scoped (kept).
  // (M9 Phase 5A Task 6: the lib/db exclusions are gone with lib/db itself.)
  const EXCLUDED_FILES: string[] = [];
  const ROOTS = ['lib', 'state', 'hooks', 'services', 'components', 'app'];
  const PATTERNS = [
    /AsyncStorage\.(?:getItem|setItem|removeItem)\(\s*'([^']+)'/g,
    /(?:KEY|KEYS|PREFIX)[A-Z_]*\s*(?::\s*string)?\s*=\s*'([^']+)'/g,
    /`(@livra[^`$]*)\$\{/g,
  ];

  const collectKeys = (): Map<string, string> => {
    const found = new Map<string, string>();
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.tsx?$/.test(entry.name)) continue;
        if (EXCLUDED_FILES.some((excluded) => full.endsWith(excluded))) continue;
        const src = fs.readFileSync(full, 'utf8');
        for (const pattern of PATTERNS) {
          pattern.lastIndex = 0;
          let match: RegExpExecArray | null;
          while ((match = pattern.exec(src))) {
            if (!found.has(match[1])) found.set(match[1], full);
          }
        }
      }
    };
    for (const root of ROOTS) walk(path.join(process.cwd(), root));
    return found;
  };

  it('classifies every storage key literal in the app', () => {
    const classified = new Set<string>([
      ...ACCOUNT_SCOPED_STORAGE_KEYS,
      ...ACCOUNT_SCOPED_KEY_PREFIXES,
      ...DEVICE_SCOPED_STORAGE_KEYS,
      ...NON_ASYNC_STORAGE_LITERALS,
    ]);

    const unclassified = [...collectKeys().entries()]
      .filter(([key]) => !classified.has(key))
      .map(([key, file]) => `${key} (${file})`);

    expect(unclassified).toEqual([]);
  });

  it('keeps the two registries disjoint', () => {
    const overlap = ACCOUNT_SCOPED_STORAGE_KEYS.filter((key) =>
      (DEVICE_SCOPED_STORAGE_KEYS as readonly string[]).includes(key),
    );
    expect(overlap).toEqual([]);
  });
});

describe('purgeLocalUserData — failure handling', () => {
  it('reports a failed step instead of throwing', async () => {
    const spy = jest
      .spyOn(AsyncStorage, 'getAllKeys')
      .mockRejectedValueOnce(new Error('storage unavailable'));

    const result = await purgeLocalUserData();

    expect(result.failures).toContain('storageKeys');
    spy.mockRestore();
  });

  it('still resets the kept in-memory stores when the key sweep fails', async () => {
    useIdentityStore.setState({ fired: { 'mark-1': ['first-week'] }, loaded: true });
    const spy = jest
      .spyOn(AsyncStorage, 'getAllKeys')
      .mockRejectedValueOnce(new Error('storage unavailable'));

    await purgeLocalUserData();

    expect(useIdentityStore.getState().fired).toEqual({});
    spy.mockRestore();
  });
});

describe('sign-out wiring', () => {
  it('signOut runs the purge', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'hooks', 'useAuth.ts'), 'utf8');
    const signOutBody = src.slice(src.indexOf('const signOut ='));
    expect(signOutBody).toContain('purgeLocalUserData');
  });

  // M9 Phase 5A Task 3 Step 3 (§7.4): before the sign-out confirm, the outbox
  // is flushed best-effort, and anything still stranded is TOLD to the user —
  // silent loss is what the old system did.
  it('settings attempts an outbox flush and warns about stranded check-ins', () => {
    const stripComments = (s: string) =>
      s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const src = stripComments(
      fs.readFileSync(path.join(process.cwd(), 'app', '(tabs)', 'settings.tsx'), 'utf8'),
    );
    const body = src.slice(src.indexOf('const handleSignOut ='));
    const flushAt = body.indexOf('flushOutbox(');
    const confirmAt = body.indexOf('await confirm(');
    expect(flushAt).toBeGreaterThan(-1);
    expect(confirmAt).toBeGreaterThan(-1);
    expect(flushAt).toBeLessThan(confirmAt);
    expect(body).toContain('pendingOutboxEntries()');
    expect(body).toContain('Sign out anyway');
  });
});
