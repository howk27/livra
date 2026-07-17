/**
 * Goals the SERVER refused on push, held for re-attempt (M6-B).
 *
 * THE PROBLEM THIS SOLVES: the RESTRICTIVE "Free tier: max 2 active goals" policy
 * (20260613) was dormant only because nothing ever inserted goals. This milestone
 * wakes it. A free user's 3rd active goal is now rejected BY THE SERVER, and the
 * client has three bad options and one good one:
 *
 *   * throw → the push cursor never advances, so marks/events/streaks stop
 *     syncing too. One capped goal wedges the entire sync. Unacceptable.
 *   * swallow + advance the cursor → the goal is never pushed again. It survives
 *     locally but silently never reaches the cloud, which is the exact bug this
 *     milestone exists to fix. Unacceptable.
 *   * retry forever → a paywall is not a transient failure. Unacceptable.
 *   * THIS: drop the refused ids from the push, let everything else through,
 *     advance the cursor, and remember the ids so each later push re-attempts
 *     them independently of the cursor. When the user upgrades or deletes a goal,
 *     the next sync carries them up with no further action.
 *
 * The same shape the deleted-counter push uses: rows that must outlive the cursor
 * are re-queried by id every run rather than trusted to updated_at.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

const GOAL_CAP_BLOCKED_KEY = 'sync_goal_cap_blocked_ids';

export async function readGoalCapBlockedIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(GOAL_CAP_BLOCKED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export async function writeGoalCapBlockedIds(ids: string[]): Promise<void> {
  try {
    const unique = Array.from(new Set(ids));
    if (unique.length === 0) {
      await AsyncStorage.removeItem(GOAL_CAP_BLOCKED_KEY);
      return;
    }
    await AsyncStorage.setItem(GOAL_CAP_BLOCKED_KEY, JSON.stringify(unique));
  } catch (err) {
    logger.warn('[SYNC] Could not persist goal cap-blocked ids:', err);
  }
}

export async function addGoalCapBlockedIds(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const existing = await readGoalCapBlockedIds();
  await writeGoalCapBlockedIds([...existing, ...ids]);
}

/** Called when a previously-refused goal finally pushes (upgrade / goal deleted). */
export async function clearGoalCapBlockedIds(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const existing = await readGoalCapBlockedIds();
  const drop = new Set(ids);
  await writeGoalCapBlockedIds(existing.filter((id) => !drop.has(id)));
}
