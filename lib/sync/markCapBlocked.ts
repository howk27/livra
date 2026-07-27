/**
 * Marks the SERVER refused on push under the free-tier ceiling, held for
 * re-attempt. The goal side has worked this way since M6-B; the mark side threw
 * instead, and that throw is this project's longest-lived poison pill.
 *
 * WHAT IT LOOKED LIKE: a free account over FREE_MARK_CEILING gets one mark
 * refused by RLS. pushChanges raised SYNC_PRO_COUNTER_LIMIT, so writePushCursor
 * never ran, so the cursor never advanced — and EVERY later sync replayed the
 * same batch, hit the same refusal, and stopped at the same place. Not just the
 * offending mark: every event, streak, badge, goal and link queued behind it,
 * forever, with no user action able to clear it except deleting the mark.
 *
 * It was filed 2026-07-26 from the founder's own account, where the diagnosis
 * read "a rejected row makes the push throw, everything queued behind it never
 * goes, and the same rejection repeats every sync — a permanent poison pill."
 *
 * WHY MARKS ARE NOT JUST GOALS: a mark is a PARENT. Events, streaks and badges
 * reference it, and pushing a child whose parent is not on the server is itself
 * a rejection. That is already handled and needed no new work — children are
 * gated on activeParentIdsUpsertedThisRun, which only ever collects marks from
 * upserts that actually SUCCEEDED. A refused mark simply never enters that set,
 * so its children are held back by the existing rule rather than a new one.
 */
import { createCapBlockedStore } from './capBlockedIds';

const MARK_CAP_BLOCKED_KEY = 'sync_mark_cap_blocked_ids';

const store = createCapBlockedStore(MARK_CAP_BLOCKED_KEY, 'mark');

export const readMarkCapBlockedIds = store.read;
export const writeMarkCapBlockedIds = store.write;
export const addMarkCapBlockedIds = store.add;

/**
 * Called when a previously-refused mark finally pushes (the user upgraded, or
 * deleted a mark and freed a slot), or when it no longer exists locally as an
 * active row — otherwise a mark deleted while blocked would be re-attempted for
 * the life of the install.
 */
export const clearMarkCapBlockedIds = store.clear;
