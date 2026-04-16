import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

const KEY = 'livra_sync_diag_v1';

/** Persisted after successful core sync so any screen can show honest maintenance/dup metadata (single useSync instance per mount is not global). */
export type SyncDiagSnapshotV1 = {
  coreSyncedAtIso: string;
  maintenanceWarnings: string[];
  duplicateMarkNameGroupCount: number;
  lastStreakRecomputeSource: string;
  writtenAtIso: string;
};

export async function writeSyncDiagSnapshot(snapshot: Omit<SyncDiagSnapshotV1, 'writtenAtIso'>): Promise<void> {
  const full: SyncDiagSnapshotV1 = {
    ...snapshot,
    writtenAtIso: new Date().toISOString(),
  };
  await AsyncStorage.setItem(KEY, JSON.stringify(full));
}

export async function readSyncDiagSnapshot(): Promise<SyncDiagSnapshotV1 | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SyncDiagSnapshotV1;
  } catch (err) {
    logger.warn('[SyncDiag] persisted snapshot parse failed; ignoring', {
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export async function clearSyncDiagSnapshot(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
