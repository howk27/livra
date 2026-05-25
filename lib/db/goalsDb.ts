import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Goal } from '../../types/goal';

const GOALS_KEY = '@livra_goals';

async function readAll(): Promise<Goal[]> {
  try {
    const raw = await AsyncStorage.getItem(GOALS_KEY);
    return raw ? (JSON.parse(raw) as Goal[]) : [];
  } catch {
    return [];
  }
}

async function writeAll(goals: Goal[]): Promise<void> {
  await AsyncStorage.setItem(GOALS_KEY, JSON.stringify(goals));
}

export async function loadGoalsForUser(userId: string): Promise<Goal[]> {
  const all = await readAll();
  return all.filter(g => g.user_id === userId);
}

export async function upsertGoal(goal: Goal): Promise<void> {
  const all = await readAll();
  const idx = all.findIndex(g => g.id === goal.id);
  if (idx >= 0) {
    all[idx] = goal;
  } else {
    all.push(goal);
  }
  await writeAll(all);
}

export async function upsertGoals(updatedGoals: Goal[]): Promise<void> {
  const all = await readAll();
  const map = new Map(all.map(g => [g.id, g]));
  for (const goal of updatedGoals) {
    map.set(goal.id, goal);
  }
  await writeAll(Array.from(map.values()));
}

export async function removeGoal(id: string): Promise<void> {
  const all = await readAll();
  await writeAll(all.filter(g => g.id !== id));
}
