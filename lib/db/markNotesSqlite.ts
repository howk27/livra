import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MarkNote } from '../../types';
import { logger } from '../utils/logger';

const DB_NAME = 'livra_mark_notes.db';
const MIGRATION_FLAG_KEY = '@livra_notes_sqlite_migrated_v1';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function markNotesSqliteSupported(): boolean {
  return Platform.OS !== 'web';
}

async function openDb(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS mark_notes (
      id TEXT PRIMARY KEY NOT NULL,
      mark_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      date TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_mark_notes_mark_date ON mark_notes(mark_id, date);
  `);
  return db;
}

export async function getMarkNotesDb(): Promise<SQLite.SQLiteDatabase> {
  if (!markNotesSqliteSupported()) {
    throw new Error('Mark notes SQLite is not used on web');
  }
  if (!dbPromise) {
    dbPromise = openDb();
  }
  return dbPromise;
}

/** One-time copy from legacy AsyncStorage list into SQLite, then clear the legacy key. */
export async function migrateMarkNotesFromAsyncStorage(notesStorageKey: string): Promise<void> {
  if (!markNotesSqliteSupported()) return;
  try {
    const done = await AsyncStorage.getItem(MIGRATION_FLAG_KEY);
    if (done === '1') return;

    const raw = await AsyncStorage.getItem(notesStorageKey);
    const legacy: MarkNote[] = raw ? JSON.parse(raw) : [];
    if (legacy.length === 0) {
      await AsyncStorage.setItem(MIGRATION_FLAG_KEY, '1');
      return;
    }

    const db = await getMarkNotesDb();
    await db.withTransactionAsync(async () => {
      for (const n of legacy) {
        if (!n?.mark_id || !n?.date) continue;
        await db.runAsync(
          `INSERT INTO mark_notes (id, mark_id, user_id, date, text, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(mark_id, date) DO UPDATE SET
             text = excluded.text,
             updated_at = excluded.updated_at,
             user_id = excluded.user_id`,
          [n.id, n.mark_id, n.user_id, n.date, n.text ?? '', n.created_at, n.updated_at],
        );
      }
    });
    await AsyncStorage.removeItem(notesStorageKey);
    await AsyncStorage.setItem(MIGRATION_FLAG_KEY, '1');
    logger.log(`[MarkNotesSQLite] Migrated ${legacy.length} note(s) from AsyncStorage`);
  } catch (e) {
    logger.error('[MarkNotesSQLite] Migration failed:', e);
  }
}

export async function loadAllMarkNotes(): Promise<MarkNote[]> {
  const db = await getMarkNotesDb();
  const rows = await db.getAllAsync<MarkNote>(
    'SELECT id, mark_id, user_id, date, text, created_at, updated_at FROM mark_notes ORDER BY date DESC, updated_at DESC',
  );
  return rows ?? [];
}

export async function sqliteUpsertMarkNote(note: MarkNote): Promise<void> {
  const db = await getMarkNotesDb();
  await db.runAsync(
    `INSERT INTO mark_notes (id, mark_id, user_id, date, text, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(mark_id, date) DO UPDATE SET
       text = excluded.text,
       updated_at = excluded.updated_at,
       user_id = excluded.user_id`,
    [note.id, note.mark_id, note.user_id, note.date, note.text, note.created_at, note.updated_at],
  );
}

export async function sqliteDeleteMarkNote(noteId: string): Promise<void> {
  const db = await getMarkNotesDb();
  await db.runAsync('DELETE FROM mark_notes WHERE id = ?', [noteId]);
}

export async function sqliteDeleteNotesForMark(markId: string): Promise<void> {
  const db = await getMarkNotesDb();
  await db.runAsync('DELETE FROM mark_notes WHERE mark_id = ?', [markId]);
}
