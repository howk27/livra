/**
 * Goals the SERVER refused on push, held for re-attempt (M6-B).
 *
 * The mechanism and the argument behind it now live in capBlockedIds.ts, which
 * marks adopted verbatim when the same defect was found on their push path. This
 * file keeps its original exported names so the goal push did not have to change
 * to pick up the shared implementation.
 *
 * THE PROBLEM THIS SOLVES: the RESTRICTIVE "Free tier: max 2 active goals" policy
 * (20260613) was dormant only because nothing ever inserted goals. This milestone
 * wakes it. A free user's 3rd active goal is now rejected BY THE SERVER, and the
 * client has three bad options and one good one — see capBlockedIds.ts.
 */
import { createCapBlockedStore } from './capBlockedIds';

const GOAL_CAP_BLOCKED_KEY = 'sync_goal_cap_blocked_ids';

const store = createCapBlockedStore(GOAL_CAP_BLOCKED_KEY, 'goal');

export const readGoalCapBlockedIds = store.read;
export const writeGoalCapBlockedIds = store.write;
export const addGoalCapBlockedIds = store.add;

/** Called when a previously-refused goal finally pushes (upgrade / goal deleted). */
export const clearGoalCapBlockedIds = store.clear;
