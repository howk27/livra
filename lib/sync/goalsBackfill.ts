/**
 * One-time cursor-independent backfill of goals + links (M6-B review fix).
 *
 * THE BUG THIS FIXES — it defeated the entire milestone, silently:
 * goals migrated out of AsyncStorage keep their ORIGINAL updated_at
 * (goalsSqlite.ts, `updated_at: g.updated_at ?? g.created_at ?? now`), which is
 * correct — it is when the user last touched the goal. But the push is a cursor
 * query (`WHERE updated_at > ?`) against the SHARED push cursor that marks
 * already advance. Any user who has EVER synced has a cursor newer than their
 * migrated goals, so every one of those goals is older than the cursor and is
 * excluded from every push, forever — until the user happens to edit it.
 *
 * That reproduces the founder's original bug exactly: reinstall, and the goals
 * are gone, because the server never received them. The population it hits is
 * precisely the one this milestone was built for — existing users with real
 * goals. Every test missed it because they all pass an EPOCH cursor, the one
 * value for which `updated_at > cursor` is trivially true.
 *
 * THE FIX: a push is not "everything since the cursor" for a table that has
 * never been pushed at all. Until goals have been fully backfilled once, the
 * push ignores the cursor and takes everything; after one success it reverts to
 * normal incremental behaviour.
 *
 * The flag is "have we EVER completed a full goals push?", NOT "did the
 * migration run" — deliberately. It self-heals: a user who already installed M6
 * before this fix, whose goals are sitting un-pushed right now, is repaired by
 * the next sync with no migration re-run and no intervention. It also costs a
 * new user nothing: their first push is 0–2 goals either way.
 *
 * Same shape as goalCapBlocked.ts — rows that must outlive the cursor cannot be
 * trusted to updated_at.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

const GOALS_BACKFILL_DONE_KEY = 'sync_goals_backfill_done';

/** The cursor value that means "everything" — the same epoch useSync falls back to. */
export const BACKFILL_EPOCH_ISO = new Date(0).toISOString();

/**
 * True until a full, cursor-independent goals push has succeeded once.
 * Fails OPEN (returns true) on a storage error: pushing everything again is
 * idempotent (upsert), while wrongly skipping the backfill loses the goals.
 */
export async function isGoalsBackfillPending(): Promise<boolean> {
  try {
    const done = await AsyncStorage.getItem(GOALS_BACKFILL_DONE_KEY);
    return done !== '1';
  } catch (e) {
    logger.warn('[SYNC] Could not read goals backfill flag; backfilling again', e);
    return true;
  }
}

/** Called only after a push that actually reached the server. */
export async function markGoalsBackfillDone(): Promise<void> {
  try {
    await AsyncStorage.setItem(GOALS_BACKFILL_DONE_KEY, '1');
  } catch (e) {
    // Non-fatal: the next sync backfills again. Idempotent, just wasted bytes.
    logger.warn('[SYNC] Could not persist goals backfill flag', e);
  }
}

/** Test seam. */
export async function resetGoalsBackfillForTests(): Promise<void> {
  await AsyncStorage.removeItem(GOALS_BACKFILL_DONE_KEY);
}
