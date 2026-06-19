// lib/goalMomentumStore.ts
// Thin AsyncStorage wrapper for Momentum. The only Momentum file that touches storage.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { yyyyMmDd } from './date';
import {
  markMomentum,
  goalMomentumState,
  nextMomentumRecord,
  momentumSnapshot,
  type MarkMomentumInput,
  type MomentumRecord,
  type MomentumSnapshot,
} from './goalMomentum';

const keyFor = (goalId: string) => `@livra_momentum_${goalId}`;

export async function loadMomentumRecord(goalId: string): Promise<MomentumRecord | null> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(goalId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.goalId === 'string' &&
      (parsed.startDate === null || typeof parsed.startDate === 'string')
    ) {
      return parsed as MomentumRecord;
    }
    return null;
  } catch {
    return null;
  }
}

/** Evaluate a goal's Momentum for `today`, persist the updated record, return the snapshot. */
export async function evaluateGoalMomentum(
  goalId: string,
  marks: MarkMomentumInput[],
  today: string = yyyyMmDd(new Date()),
): Promise<MomentumSnapshot> {
  const prev = await loadMomentumRecord(goalId);
  const mms = marks.map((m) => markMomentum(m, today));
  const state = goalMomentumState(mms);
  const record = nextMomentumRecord(prev, goalId, state, today);
  try {
    await AsyncStorage.setItem(keyFor(goalId), JSON.stringify(record));
  } catch {
    // best effort — record is a convenience cache, recomputed from marks next open
  }
  return momentumSnapshot(marks, record, today);
}
