import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Goal, GoalMarkLink } from '../../types/goal';

const GOALS_KEY = '@livra_goals';
const LINKS_KEY = '@livra_goal_mark_links';

// ── Goals ─────────────────────────────────────────────────────────────────────

async function readAll(): Promise<Goal[]> {
  try {
    const raw = await AsyncStorage.getItem(GOALS_KEY);
    if (!raw) return [];
    const goals = JSON.parse(raw) as Goal[];
    return goals.map(normalizeGoal);
  } catch {
    return [];
  }
}

function normalizeGoal(g: Goal): Goal {
  return {
    ...g,
    current_mark_count: g.current_mark_count ?? 0,
    deadline_date: g.deadline_date ?? g.target_date ?? null,
  };
}

async function writeAll(goals: Goal[]): Promise<void> {
  await AsyncStorage.setItem(GOALS_KEY, JSON.stringify(goals));
}

export async function loadGoalsForUser(userId: string): Promise<Goal[]> {
  const all = await readAll();
  const userGoals = all.filter(g => g.user_id === userId);
  // Populate linked_mark_ids from the links table
  const links = await loadLinksForUser(userId);
  return userGoals.map(g => ({
    ...g,
    linked_mark_ids: links
      .filter(l => l.goal_id === g.id)
      .map(l => l.mark_id),
  }));
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
  // Also remove all links for this goal
  const links = await readAllLinks();
  await writeAllLinks(links.filter(l => l.goal_id !== id));
}

// ── Goal-Mark Links ───────────────────────────────────────────────────────────

async function readAllLinks(): Promise<GoalMarkLink[]> {
  try {
    const raw = await AsyncStorage.getItem(LINKS_KEY);
    return raw ? (JSON.parse(raw) as GoalMarkLink[]) : [];
  } catch {
    return [];
  }
}

async function writeAllLinks(links: GoalMarkLink[]): Promise<void> {
  await AsyncStorage.setItem(LINKS_KEY, JSON.stringify(links));
}

export async function loadLinksForUser(userId: string): Promise<GoalMarkLink[]> {
  const allLinks = await readAllLinks();
  const allGoals = await readAll();
  const userGoalIds = new Set(allGoals.filter(g => g.user_id === userId).map(g => g.id));
  return allLinks.filter(l => userGoalIds.has(l.goal_id));
}

export async function addGoalMarkLink(link: GoalMarkLink): Promise<void> {
  const links = await readAllLinks();
  const exists = links.some(l => l.goal_id === link.goal_id && l.mark_id === link.mark_id);
  if (!exists) {
    links.push(link);
    await writeAllLinks(links);
  }
}

export async function removeGoalMarkLink(goalId: string, markId: string): Promise<void> {
  const links = await readAllLinks();
  await writeAllLinks(links.filter(l => !(l.goal_id === goalId && l.mark_id === markId)));
}

export async function getLinksForMark(markId: string): Promise<GoalMarkLink[]> {
  const links = await readAllLinks();
  return links.filter(l => l.mark_id === markId);
}
