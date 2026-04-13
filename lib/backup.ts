// lib/backup.ts  –  Feature 5: Data Backup & Restore
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from './utils/logger';
import { buildBackupPayload, validateBackupPayload, type BackupPayload } from './features';
import {
  markNotesSqliteSupported,
  loadAllMarkNotes,
  sqliteUpsertMarkNote,
} from './db/markNotesSqlite';

const STORAGE_KEYS = {
  counters: '@livra_db_counters',
  events:   '@livra_db_events',
  streaks:  '@livra_db_streaks',
  notes:    '@livra_notes',
};

export async function exportBackup(): Promise<{ success: boolean; message: string }> {
  try {
    const [countersRaw, eventsRaw, streaksRaw] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEYS.counters),
      AsyncStorage.getItem(STORAGE_KEYS.events),
      AsyncStorage.getItem(STORAGE_KEYS.streaks),
    ]);

    const marks   = countersRaw ? JSON.parse(countersRaw) : [];
    const events  = eventsRaw   ? JSON.parse(eventsRaw)   : [];
    const streaks = streaksRaw  ? JSON.parse(streaksRaw)  : [];

    // On native, notes live in the SQLite DB (AsyncStorage key was cleared after migration)
    let notes: unknown[] = [];
    if (markNotesSqliteSupported()) {
      try {
        notes = await loadAllMarkNotes();
      } catch (err) {
        logger.error('[Backup] Failed to load notes from SQLite, falling back to AsyncStorage:', err);
        const notesRaw = await AsyncStorage.getItem(STORAGE_KEYS.notes);
        notes = notesRaw ? JSON.parse(notesRaw) : [];
      }
    } else {
      const notesRaw = await AsyncStorage.getItem(STORAGE_KEYS.notes);
      notes = notesRaw ? JSON.parse(notesRaw) : [];
    }

    const payload = buildBackupPayload(marks, events, streaks, notes);
    const json = JSON.stringify(payload, null, 2);

    const date = new Date().toISOString().slice(0, 10);
    const filename = `livra_backup_${date}.json`;
    const fileUri = `${FileSystem.cacheDirectory}${filename}`;
    await FileSystem.writeAsStringAsync(fileUri, json, { encoding: FileSystem.EncodingType.UTF8 });

    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) return { success: false, message: 'Sharing is not available on this device.' };

    await Sharing.shareAsync(fileUri, {
      mimeType: 'application/json',
      dialogTitle: 'Save your Livra backup',
      UTI: 'public.json',
    });

    logger.log(`[Backup] Exported ${marks.length} marks, ${events.length} events`);
    return { success: true, message: `Exported ${marks.length} marks and ${events.length} events.` };
  } catch (error) {
    logger.error('[Backup] Export failed:', error);
    return { success: false, message: error instanceof Error ? error.message : 'Export failed.' };
  }
}

export type RestoreResult = {
  success: boolean;
  message: string;
  marksRestored?: number;
  eventsRestored?: number;
};

export async function importBackup(mode: 'merge' | 'replace' = 'merge'): Promise<RestoreResult> {
  try {
    const DocumentPicker = await import('expo-document-picker');
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/json',
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets?.length) {
      return { success: false, message: 'No file selected.' };
    }

    const fileUri = result.assets[0].uri;
    const raw = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.UTF8 });

    let payload: unknown;
    try { payload = JSON.parse(raw); }
    catch { return { success: false, message: 'The selected file is not valid JSON.' }; }

    if (!validateBackupPayload(payload)) {
      return { success: false, message: 'This does not appear to be a valid Livra backup file.' };
    }

    const backup = payload as BackupPayload;

    const merge = <T extends { id: string }>(existing: T[], incoming: T[]): T[] => {
      const ids = new Set(existing.map(x => x.id));
      return [...existing, ...incoming.filter(x => !ids.has(x.id))];
    };

    if (mode === 'replace') {
      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEYS.counters, JSON.stringify(backup.marks)),
        AsyncStorage.setItem(STORAGE_KEYS.events,   JSON.stringify(backup.events)),
        AsyncStorage.setItem(STORAGE_KEYS.streaks,  JSON.stringify(backup.streaks)),
      ]);
    } else {
      const [ec, ee, es] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.counters).then(r => r ? JSON.parse(r) : []),
        AsyncStorage.getItem(STORAGE_KEYS.events).then(r   => r ? JSON.parse(r) : []),
        AsyncStorage.getItem(STORAGE_KEYS.streaks).then(r  => r ? JSON.parse(r) : []),
      ]);

      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEYS.counters, JSON.stringify(merge(ec, backup.marks))),
        AsyncStorage.setItem(STORAGE_KEYS.events,   JSON.stringify(merge(ee, backup.events))),
        AsyncStorage.setItem(STORAGE_KEYS.streaks,  JSON.stringify(merge(es, backup.streaks))),
      ]);
    }

    // Restore notes: use SQLite on native, AsyncStorage on web
    if (markNotesSqliteSupported()) {
      // Upsert all notes from backup into SQLite (handles both merge and replace)
      for (const note of backup.notes) {
        try {
          await sqliteUpsertMarkNote(note as any);
        } catch (err) {
          logger.error('[Backup] Failed to upsert note into SQLite:', err);
        }
      }
    } else {
      if (mode === 'replace') {
        await AsyncStorage.setItem(STORAGE_KEYS.notes, JSON.stringify(backup.notes));
      } else {
        const en = await AsyncStorage.getItem(STORAGE_KEYS.notes).then(r => r ? JSON.parse(r) : []);
        await AsyncStorage.setItem(STORAGE_KEYS.notes, JSON.stringify(merge(en, backup.notes)));
      }
    }

    logger.log(`[Backup] Restored ${backup.marks.length} marks, ${backup.events.length} events (${mode})`);
    return {
      success: true,
      message: `Restored ${backup.marks.length} marks and ${backup.events.length} events (${mode}).`,
      marksRestored: backup.marks.length,
      eventsRestored: backup.events.length,
    };
  } catch (error) {
    logger.error('[Backup] Import failed:', error);
    return { success: false, message: error instanceof Error ? error.message : 'Restore failed.' };
  }
}
