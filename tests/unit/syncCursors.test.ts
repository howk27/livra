const memoryStore: Record<string, string> = {};

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn((k: string, v: string) => {
    memoryStore[k] = v;
    return Promise.resolve();
  }),
  getItem: jest.fn((k: string) => Promise.resolve(memoryStore[k] ?? null)),
  removeItem: jest.fn((k: string) => {
    delete memoryStore[k];
    return Promise.resolve();
  }),
  multiRemove: jest.fn((keys: string[]) => {
    keys.forEach((k) => delete memoryStore[k]);
    return Promise.resolve();
  }),
  multiSet: jest.fn((pairs: [string, string][]) => {
    pairs.forEach(([k, v]) => {
      memoryStore[k] = v;
    });
    return Promise.resolve();
  }),
}));

import {
  migrateLegacySyncCursor,
  LAST_PUSHED_AT_KEY,
  LAST_PULLED_AT_KEY,
  LEGACY_LAST_SYNCED_AT_KEY,
  clearSyncCursors,
} from '../../lib/sync/syncCursors';

describe('syncCursors', () => {
  beforeEach(async () => {
    Object.keys(memoryStore).forEach((k) => delete memoryStore[k]);
    await clearSyncCursors();
  });

  it('copies legacy last_synced_at into both cursors when split keys missing', async () => {
    const t = '2026-01-01T00:00:00.000Z';
    memoryStore[LEGACY_LAST_SYNCED_AT_KEY] = t;
    await migrateLegacySyncCursor();
    expect(memoryStore[LAST_PUSHED_AT_KEY]).toBe(t);
    expect(memoryStore[LAST_PULLED_AT_KEY]).toBe(t);
  });

  it('does not overwrite existing split cursors', async () => {
    memoryStore[LEGACY_LAST_SYNCED_AT_KEY] = '2026-01-01T00:00:00.000Z';
    memoryStore[LAST_PUSHED_AT_KEY] = '2026-02-01T00:00:00.000Z';
    memoryStore[LAST_PULLED_AT_KEY] = '2026-03-01T00:00:00.000Z';
    await migrateLegacySyncCursor();
    expect(memoryStore[LAST_PUSHED_AT_KEY]).toBe('2026-02-01T00:00:00.000Z');
    expect(memoryStore[LAST_PULLED_AT_KEY]).toBe('2026-03-01T00:00:00.000Z');
  });
});
