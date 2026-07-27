/**
 * Rows the SERVER refused under a free-tier cap, held for re-attempt.
 *
 * Extracted from goalCapBlocked.ts when marks needed the identical treatment.
 * The reasoning below was written for goals and is reproduced because it is the
 * whole argument, and it applies verbatim to any capped table:
 *
 *   * throw → the push cursor never advances, so everything else stops syncing
 *     too. One capped row wedges the entire sync. Unacceptable.
 *   * swallow + advance the cursor → the row is never pushed again. It survives
 *     locally but silently never reaches the cloud. Unacceptable.
 *   * retry forever → a paywall is not a transient failure. Unacceptable.
 *   * THIS: drop the refused ids from the push, let everything else through,
 *     advance the cursor, and remember the ids so each later push re-attempts
 *     them independently of the cursor. When the user upgrades or deletes a row,
 *     the next sync carries them up with no further action.
 *
 * The same shape the deleted-counter push uses: rows that must outlive the
 * cursor are re-queried by id every run rather than trusted to updated_at.
 *
 * WHY A FACTORY rather than two copies: goals and marks want the same four
 * operations over different storage keys, and this project's gate runs dupe
 * detection. goalCapBlocked.ts keeps its original exported names so nothing in
 * the goal push had to change to adopt this.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

export type CapBlockedStore = {
  read: () => Promise<string[]>;
  write: (ids: string[]) => Promise<void>;
  add: (ids: string[]) => Promise<void>;
  clear: (ids: string[]) => Promise<void>;
};

export function createCapBlockedStore(storageKey: string, label: string): CapBlockedStore {
  const read = async (): Promise<string[]> => {
    try {
      const raw = await AsyncStorage.getItem(storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === 'string')
        : [];
    } catch {
      // Reading this must never break a sync: an unreadable list costs a
      // re-attempt, throwing costs the whole push.
      return [];
    }
  };

  const write = async (ids: string[]): Promise<void> => {
    try {
      const unique = Array.from(new Set(ids));
      if (unique.length === 0) {
        await AsyncStorage.removeItem(storageKey);
        return;
      }
      await AsyncStorage.setItem(storageKey, JSON.stringify(unique));
    } catch (err) {
      logger.warn(`[SYNC] Could not persist ${label} cap-blocked ids:`, err);
    }
  };

  const add = async (ids: string[]): Promise<void> => {
    if (ids.length === 0) return;
    const existing = await read();
    await write([...existing, ...ids]);
  };

  /** Called when a previously-refused row finally pushes, or stops existing. */
  const clear = async (ids: string[]): Promise<void> => {
    if (ids.length === 0) return;
    const existing = await read();
    const drop = new Set(ids);
    await write(existing.filter((id) => !drop.has(id)));
  };

  return { read, write, add, clear };
}
