import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DailyCheckin } from '../../types/checkin';

const CHECKINS_KEY = '@livra_checkins';

async function readAll(): Promise<DailyCheckin[]> {
  try {
    const raw = await AsyncStorage.getItem(CHECKINS_KEY);
    return raw ? (JSON.parse(raw) as DailyCheckin[]) : [];
  } catch {
    return [];
  }
}

async function writeAll(checkins: DailyCheckin[]): Promise<void> {
  await AsyncStorage.setItem(CHECKINS_KEY, JSON.stringify(checkins));
}

export async function loadCheckinsForUser(userId: string): Promise<DailyCheckin[]> {
  const all = await readAll();
  return all.filter(c => c.user_id === userId);
}

export async function upsertCheckin(checkin: DailyCheckin): Promise<void> {
  const all = await readAll();
  const idx = all.findIndex(
    c => c.user_id === checkin.user_id && c.goal_id === checkin.goal_id && c.date === checkin.date,
  );
  if (idx >= 0) {
    all[idx] = checkin;
  } else {
    all.push(checkin);
  }
  await writeAll(all);
}
