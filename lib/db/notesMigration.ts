// Shared one-time "copy a legacy AsyncStorage list into SQLite, then clear the
// key" migration used by both the goal-notes and mark-notes SQLite mirrors.
// Pure structural extraction of their near-identical boilerplate (QC3 cleanup):
// each caller supplies its own flag key, db opener, per-row migrate step, and
// log labels — the flag short-circuit, empty-list handling, transaction wrap,
// key cleanup, and error swallowing are the shared shape.
import * as SQLite from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

export async function migrateNotesFromAsyncStorage<T>(opts: {
  /** Skip entirely when SQLite isn't the store (e.g. web). */
  supported: boolean;
  /** AsyncStorage key holding the "already migrated" sentinel ('1'). */
  flagKey: string;
  /** AsyncStorage key holding the legacy JSON list. */
  storageKey: string;
  getDb: () => Promise<SQLite.SQLiteDatabase>;
  /** Persist one legacy row inside the open transaction (owns its own validity guard). */
  migrateRow: (row: T, db: SQLite.SQLiteDatabase) => Promise<void>;
  /** Log tag, e.g. 'GoalNotesSQLite'. */
  logLabel: string;
  /** Pluralized noun for the success log, e.g. 'entr(ies)' / 'note(s)'. */
  unit: string;
}): Promise<void> {
  const { supported, flagKey, storageKey, getDb, migrateRow, logLabel, unit } = opts;
  if (!supported) return;
  try {
    const done = await AsyncStorage.getItem(flagKey);
    if (done === '1') return;

    const raw = await AsyncStorage.getItem(storageKey);
    const legacy: T[] = raw ? JSON.parse(raw) : [];
    if (legacy.length === 0) {
      await AsyncStorage.setItem(flagKey, '1');
      return;
    }

    const db = await getDb();
    await db.withTransactionAsync(async () => {
      for (const row of legacy) {
        await migrateRow(row, db);
      }
    });
    await AsyncStorage.removeItem(storageKey);
    await AsyncStorage.setItem(flagKey, '1');
    logger.log(`[${logLabel}] Migrated ${legacy.length} ${unit} from AsyncStorage`);
  } catch (e) {
    logger.error(`[${logLabel}] Migration failed:`, e);
  }
}
