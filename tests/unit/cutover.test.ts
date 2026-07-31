/**
 * M9 Phase 5A — the one-time cutover wipe (lib/data/cutover.ts).
 *
 * Contract under test:
 *  1. First run deletes the legacy AsyncStorage keys AND the three SQLite
 *     database files, then sets the flag.
 *  2. A second launch is a strict NO-OP — nothing is read, removed or deleted
 *     again (plan Task 1 Step 5).
 *  3. Keys owned by surviving modules are untouched: the wipe targets old
 *     architecture, not live preferences.
 *  4. Never throws; a failed step is reported, and the flag is still set so
 *     the device does not retry-loop over storage nothing reads.
 *  5. WIRING: app/_layout.tsx calls runCutoverOnce() before initDatabase(),
 *     via a STATIC import — a runtime await import() dies under the Jest VM
 *     and this repo has shipped a purge that looked wired and never ran.
 */

const deleteDatabaseCalls: string[] = [];

jest.mock('expo-sqlite', () => ({
  deleteDatabaseAsync: jest.fn(async (name: string) => {
    deleteDatabaseCalls.push(name);
  }),
  openDatabaseAsync: jest.fn(async () => ({})),
}));

/* eslint-disable import/first -- jest.mock factories must precede these imports */
import fs from 'fs';
import path from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  runCutoverOnce,
  CUTOVER_FLAG_KEY,
  LEGACY_STORAGE_KEYS,
  LEGACY_SQLITE_DATABASES,
} from '../../lib/data/cutover';
/* eslint-enable import/first */

beforeEach(async () => {
  deleteDatabaseCalls.length = 0;
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

describe('runCutoverOnce — first launch', () => {
  it('removes every legacy key, deletes the SQLite files, and sets the flag', async () => {
    await AsyncStorage.multiSet([
      ['@livra_db_marks', '[]'],
      ['@livra_goals', '[]'],
      ['last_pushed_at', '2026-07-30T00:00:00.000Z'],
      ['sync_retry_queue', '[]'],
      ['@livra_migration_v2_complete', '1'],
      ['livra_last_signed_in_user_id_v1', 'user-a'],
    ]);

    const result = await runCutoverOnce();

    expect(result.ran).toBe(true);
    expect(result.failures).toEqual([]);
    for (const key of LEGACY_STORAGE_KEYS) {
      expect(await AsyncStorage.getItem(key)).toBeNull();
    }
    expect(deleteDatabaseCalls).toEqual([...LEGACY_SQLITE_DATABASES]);
    expect(await AsyncStorage.getItem(CUTOVER_FLAG_KEY)).not.toBeNull();
  });

  it('leaves keys owned by surviving modules untouched', async () => {
    await AsyncStorage.multiSet([
      ['theme_mode', 'dark'],
      ['@livra_consistency_history', '{}'],
      ['@livra_longest_runs_v1', '{}'],
      ['identity_milestones_v1', '{}'],
      ['iap_processed_index', '{}'],
      ['livra-outbox-v1', '[]'],
      ['has_completed_onboarding', 'true'],
    ]);

    await runCutoverOnce();

    expect(await AsyncStorage.getItem('theme_mode')).toBe('dark');
    expect(await AsyncStorage.getItem('@livra_consistency_history')).toBe('{}');
    expect(await AsyncStorage.getItem('@livra_longest_runs_v1')).toBe('{}');
    expect(await AsyncStorage.getItem('identity_milestones_v1')).toBe('{}');
    expect(await AsyncStorage.getItem('iap_processed_index')).toBe('{}');
    expect(await AsyncStorage.getItem('livra-outbox-v1')).toBe('[]');
    expect(await AsyncStorage.getItem('has_completed_onboarding')).toBe('true');
  });
});

describe('runCutoverOnce — second launch is a no-op', () => {
  it('does not touch storage or databases when the flag is set', async () => {
    await runCutoverOnce();
    deleteDatabaseCalls.length = 0;
    // AsyncStorage's jest mock methods are shared jest.fn instances — clear the
    // call history rather than spyOn (which would keep the first run's calls).
    (AsyncStorage.multiRemove as jest.Mock).mockClear();

    const second = await runCutoverOnce();

    expect(second.ran).toBe(false);
    expect(second.failures).toEqual([]);
    expect(AsyncStorage.multiRemove).not.toHaveBeenCalled();
    expect(deleteDatabaseCalls).toEqual([]);
  });
});

describe('runCutoverOnce — failure handling', () => {
  // NOTE: never spyOn + mockRestore the shared AsyncStorage mock fns — restore
  // strips their implementation for every later test in the file. Use *Once
  // overlays, which fall back to the real mock implementation when consumed.
  it('reports a failed key sweep instead of throwing, and still sets the flag', async () => {
    (AsyncStorage.multiRemove as jest.Mock).mockRejectedValueOnce(
      new Error('storage unavailable'),
    );

    const result = await runCutoverOnce();

    expect(result.ran).toBe(true);
    expect(result.failures).toContain('storageKeys');
    expect(await AsyncStorage.getItem(CUTOVER_FLAG_KEY)).not.toBeNull();
  });

  it('skips (does not force) the wipe when the flag itself is unreadable', async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(
      new Error('storage unavailable'),
    );

    const result = await runCutoverOnce();

    expect(result.ran).toBe(false);
    expect(result.failures).toContain('flagRead');
  });

  it('survives a database file that cannot be deleted', async () => {
    const sqlite = jest.requireMock('expo-sqlite') as {
      deleteDatabaseAsync: jest.Mock;
    };
    sqlite.deleteDatabaseAsync.mockRejectedValueOnce(new Error('no such file'));

    const result = await runCutoverOnce();

    expect(result.ran).toBe(true);
    // Missing-file deletes are expected on fresh installs; not a failure.
    expect(result.failures).toEqual([]);
    expect(await AsyncStorage.getItem(CUTOVER_FLAG_KEY)).not.toBeNull();
  });
});

describe('cutover — boot wiring', () => {
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  it('app/_layout.tsx statically imports and awaits runCutoverOnce first in init', () => {
    const src = stripComments(
      fs.readFileSync(path.join(process.cwd(), 'app', '_layout.tsx'), 'utf8'),
    );

    expect(src).toMatch(/import\s*\{\s*runCutoverOnce\s*\}\s*from\s*'..\/lib\/data\/cutover'/);
    expect(src).not.toMatch(/import\(\s*'[^']*cutover'/);

    // Before the earliest boot read that could touch (or recreate) old storage.
    // Anchored to the app-date hydrate, which survives Phase 5A.
    const cutoverAt = src.indexOf('await runCutoverOnce()');
    const hydrateAt = src.indexOf('useAppDateStore.getState().hydrate()');
    expect(cutoverAt).toBeGreaterThan(-1);
    expect(hydrateAt).toBeGreaterThan(-1);
    expect(cutoverAt).toBeLessThan(hydrateAt);
  });
});
