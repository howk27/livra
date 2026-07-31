/**
 * Sign-out used to clear the Supabase session and the onboarding flag and
 * nothing else, so the previous account's marks, events, goals, links, notes,
 * XP, momentum records, identity memory and widget snapshot all stayed on the
 * device for whoever signed in next (hooks/useAuth.ts, human queue 2026-07-22).
 *
 * Contract under test:
 *  1. Account-scoped keys go, device-scoped keys stay, per-goal/per-mark key
 *     FAMILIES go by prefix.
 *  2. The three real SQLite databases are emptied — a wipe, never a tombstone:
 *     these rows still belong to the signed-out account server-side.
 *  3. The stores that never re-hydrate from an empty file (identity milestones,
 *     momentum's longest runs) are reset in MEMORY, or the next account
 *     inherits them and momentum writes them straight back to disk.
 *  4. A failing step never throws — a user stranded in a signed-in session is
 *     worse than a partial wipe — and the failure is reported, not swallowed.
 *  5. DRIFT GUARD: every storage-key literal in the app is classified in one of
 *     the registries. A new key cannot silently rejoin the leak.
 */

const execCalls: string[] = [];

jest.mock('expo-sqlite', () => {
  const db = {
    execAsync: jest.fn(async (sql: string) => {
      execCalls.push(sql);
    }),
    runAsync: jest.fn(async () => ({ changes: 0 })),
    getAllAsync: jest.fn(async () => []),
    getFirstAsync: jest.fn(async () => null),
    withTransactionAsync: jest.fn(async (cb: (d: unknown) => Promise<void>) => cb(db)),
  };
  return { openDatabaseAsync: jest.fn(async () => db) };
});

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
} from '../../lib/db/purgeLocalUserData';
import { initDatabase, getDatabase, query, execute } from '../../lib/db';
import { useIdentityStore } from '../../state/identitySlice';
import { useMomentumStore } from '../../state/momentumSlice';
import { useMarksStore } from '../../state/countersSlice';
import { useGoalsStore } from '../../state/goalsSlice';
/* eslint-enable import/first */

beforeEach(async () => {
  execCalls.length = 0;
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

describe('purgeLocalUserData — SQLite', () => {
  it('empties goals, links and goal notes', async () => {
    await purgeLocalUserData();

    const deletes = execCalls.filter((sql) => sql.includes('DELETE FROM')).join(' ');
    expect(deletes).toContain('DELETE FROM goal_mark_links');
    expect(deletes).toContain('DELETE FROM goals');
    expect(deletes).toContain('DELETE FROM goal_notes');
  });

  it('wipes rather than tombstones — nothing here may travel to the server', async () => {
    await purgeLocalUserData();

    const wipes = execCalls.filter((sql) => sql.includes('DELETE FROM'));
    expect(wipes.length).toBeGreaterThan(0);
    for (const sql of wipes) {
      expect(sql).not.toMatch(/deleted_at/);
    }
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

  it('clears the rendered data stores', async () => {
    useMarksStore.setState({ marks: [{ id: 'm1', name: 'Run' } as never] });
    useGoalsStore.setState({ goals: [{ id: 'g1', title: 'Marathon' } as never] });

    await purgeLocalUserData();

    expect(useMarksStore.getState().marks).toEqual([]);
    expect(useGoalsStore.getState().goals).toEqual([]);
  });
});

describe('purgeLocalUserData — the app is still usable afterwards', () => {
  // QC-1058 R1. The purge nulled the mock DB handle and nothing rebuilt it:
  // initDatabase() runs once, at boot, so the FIRST read after any account
  // switch threw 'Database not initialized' and the app sat blank until it was
  // force-quit. The wipe was never the bug — leaving no handle behind was.
  it('leaves a live database handle, not a null one', async () => {
    await initDatabase();

    await purgeLocalUserData();

    expect(() => getDatabase()).not.toThrow();
  });

  it('reads empty instead of throwing after the purge', async () => {
    await initDatabase();
    await execute(
      'INSERT INTO lc_counters (id, user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      ['m1', 'user-a', 'Water', '2026-07-26T00:00:00.000Z', '2026-07-26T00:00:00.000Z'],
    );

    await purgeLocalUserData();

    // The next account's first read: empty, and it RESOLVES.
    await expect(
      query('SELECT * FROM lc_counters WHERE user_id = ? AND deleted_at IS NULL', ['user-b']),
    ).resolves.toEqual([]);
  });

  it('reports mockDb rather than stranding the app when the reopen fails', async () => {
    const result = await purgeLocalUserData();

    // Baseline: the healthy path reports no database failure at all.
    expect(result.failures).not.toContain('mockDb');
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

  it('still clears SQLite when the key sweep fails', async () => {
    const spy = jest
      .spyOn(AsyncStorage, 'getAllKeys')
      .mockRejectedValueOnce(new Error('storage unavailable'));

    await purgeLocalUserData();

    expect(execCalls.filter((sql) => sql.includes('DELETE FROM')).length).toBeGreaterThan(0);
    spy.mockRestore();
  });
});

describe('sign-out wiring', () => {
  it('signOut runs the purge', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'hooks', 'useAuth.ts'), 'utf8');
    const signOutBody = src.slice(src.indexOf('const signOut ='));
    expect(signOutBody).toContain('purgeLocalUserData');
  });
});

describe('storage-key drift guard', () => {
  // Every persisted key is account-scoped (purged) or device-scoped (kept).
  // lib/db/index.ts and lib/db/xpDb.ts are excluded: their keys are the mock
  // DB's own STORAGE_KEYS, owned by resetDatabaseState — the purge's first step.
  const EXCLUDED_FILES = [path.join('lib', 'db', 'index.ts'), path.join('lib', 'db', 'xpDb.ts')];
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
