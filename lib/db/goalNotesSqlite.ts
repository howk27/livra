// Local SQLite mirror for goal_notes (QC3-D — goal-level MULTI-ENTRY journal).
//
// Identity model (differs from mark_notes): each entry is its own row keyed by a
// client-generated uuid — the entry's `id`. There is NO natural-key upsert; the
// id is the identity, so an offline entry reconciles to the same row on sync.
// Local SQLite is authoritative; Supabase is best-effort backup (see the slice).

import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GoalNote } from '../../types';
import { logger } from '../utils/logger';

const DB_NAME = 'livra_goal_notes.db';
const MIGRATION_FLAG_KEY = '@livra_goal_notes_sqlite_migrated_v1';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function goalNotesSqliteSupported(): boolean {
  return Platform.OS !== 'web';
}

async function openDb(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS goal_notes (
      id TEXT PRIMARY KEY NOT NULL,
      goal_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      local_date TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_goal_notes_goal_created ON goal_notes(goal_id, created_at DESC);
  `);
  return db;
}

export async function getGoalNotesDb(): Promise<SQLite.SQLiteDatabase> {
  if (!goalNotesSqliteSupported()) {
    throw new Error('Goal notes SQLite is not used on web');
  }
  if (!dbPromise) {
    dbPromise = openDb();
  }
  return dbPromise;
}

/**
 * One-time copy from a legacy AsyncStorage list into SQLite, then clear the key.
 * Parallels the mark-notes migration; a goal-notes AsyncStorage list only exists
 * on the web (no-SQLite) path, so on native this is effectively a flag-set no-op.
 */
export async function migrateGoalNotesFromAsyncStorage(notesStorageKey: string): Promise<void> {
  if (!goalNotesSqliteSupported()) return;
  try {
    const done = await AsyncStorage.getItem(MIGRATION_FLAG_KEY);
    if (done === '1') return;

    const raw = await AsyncStorage.getItem(notesStorageKey);
    const legacy: GoalNote[] = raw ? JSON.parse(raw) : [];
    if (legacy.length === 0) {
      await AsyncStorage.setItem(MIGRATION_FLAG_KEY, '1');
      return;
    }

    const db = await getGoalNotesDb();
    await db.withTransactionAsync(async () => {
      for (const n of legacy) {
        if (!n?.id || !n?.goal_id) continue;
        await sqliteUpsertGoalNote(n, db);
      }
    });
    await AsyncStorage.removeItem(notesStorageKey);
    await AsyncStorage.setItem(MIGRATION_FLAG_KEY, '1');
    logger.log(`[GoalNotesSQLite] Migrated ${legacy.length} entr(ies) from AsyncStorage`);
  } catch (e) {
    logger.error('[GoalNotesSQLite] Migration failed:', e);
  }
}

export async function loadAllGoalNotes(): Promise<GoalNote[]> {
  const db = await getGoalNotesDb();
  const rows = await db.getAllAsync<GoalNote>(
    'SELECT id, goal_id, user_id, local_date, text, created_at, updated_at FROM goal_notes ORDER BY created_at DESC',
  );
  return rows ?? [];
}

/**
 * Insert-or-update a single entry by its `id` (the identity). Because the id is
 * client-generated and stable, ON CONFLICT(id) DO UPDATE both persists new
 * entries and applies edits — an offline entry always reconciles to the same row.
 */
export async function sqliteUpsertGoalNote(
  note: GoalNote,
  existingDb?: SQLite.SQLiteDatabase,
): Promise<void> {
  const db = existingDb ?? (await getGoalNotesDb());
  await db.runAsync(
    `INSERT INTO goal_notes (id, goal_id, user_id, local_date, text, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       text = excluded.text,
       local_date = excluded.local_date,
       updated_at = excluded.updated_at,
       user_id = excluded.user_id`,
    [note.id, note.goal_id, note.user_id, note.local_date, note.text, note.created_at, note.updated_at],
  );
}

/** Delete one entry by its id (the identity). */
export async function sqliteDeleteGoalNote(id: string): Promise<void> {
  const db = await getGoalNotesDb();
  await db.runAsync('DELETE FROM goal_notes WHERE id = ?', [id]);
}
