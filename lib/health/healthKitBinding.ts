// lib/health/healthKitBinding.ts
//
// M9 Phase 5A Task 6 — the device-local home for a mark's HealthKit binding.
//
// `health_kit_type` / `health_kit_config` have NO server columns (recorded in
// lib/data/types.ts) and their old home — the SQLite marks row — is retired
// with the store. They are device-only BY DESIGN: a HealthKit grant is a fact
// about THIS phone, not the account, so the binding lives in AsyncStorage next
// to the other per-mark device state (sleep notification times).
//
// One JSON map under a single key: enumerable for the weekly reflection,
// removable in one purge step, and visible to the storage-key drift guard.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';
import type { HealthKitType } from './healthTypes';

export const HEALTH_KIT_BINDINGS_KEY = 'livra_health_kit_bindings_v1';

export interface HealthKitBinding {
  type: HealthKitType;
  config: { stepGoal?: number } | null;
}

type BindingMap = Record<string, HealthKitBinding>;

async function loadMap(): Promise<BindingMap> {
  try {
    const raw = await AsyncStorage.getItem(HEALTH_KIT_BINDINGS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as BindingMap) : {};
  } catch {
    return {};
  }
}

async function saveMap(map: BindingMap): Promise<void> {
  await AsyncStorage.setItem(HEALTH_KIT_BINDINGS_KEY, JSON.stringify(map));
}

/** The binding for one mark, or null when the mark is not health-connected. */
export async function getHealthKitBinding(markId: string): Promise<HealthKitBinding | null> {
  return (await loadMap())[markId] ?? null;
}

/** Every bound mark at once (weekly-reflection shape). */
export async function allHealthKitBindings(): Promise<Record<string, HealthKitBinding>> {
  return loadMap();
}

/** Set (or, with null, remove) a mark's binding. Never throws — a failed write
 * must not break the connect flow; the caller's UI state is the optimistic
 * truth and the next set retries the persist. */
export async function setHealthKitBinding(
  markId: string,
  binding: HealthKitBinding | null,
): Promise<void> {
  try {
    const map = await loadMap();
    if (binding === null) {
      if (!(markId in map)) return;
      delete map[markId];
    } else {
      map[markId] = binding;
    }
    await saveMap(map);
  } catch (error) {
    logger.warn('[healthKitBinding] persist failed:', error);
  }
}
