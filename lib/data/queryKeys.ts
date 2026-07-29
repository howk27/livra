// lib/data/queryKeys.ts
//
// M9 Phase 1 — the ONE query-key factory. Every key is namespaced by user id.
//
// This is the account-switch fix (Spec §7.5): because a cache entry is scoped to
// the user id, account B can never read account A's cached rows, which is what
// lets `lib/db/accountSwitchGuard.ts` and the purge machinery be DELETED (not
// fixed) in Phase 5. It is load-bearing, not hygiene.
//
// GUARD (Phase 1 Task 3 Step 2): every factory takes `userId` as its FIRST
// parameter, so a key without a user id cannot be constructed — omitting it is a
// `tsc` "expected N arguments" error, not a lint convention.

const ROOT = 'livra' as const;

export const queryKeys = {
  /** Root of everything this user owns — invalidate to drop the whole account cache. */
  all: (userId: string) => [ROOT, userId] as const,

  goals: (userId: string) => [ROOT, userId, 'goals'] as const,
  goal: (userId: string, goalId: string) => [ROOT, userId, 'goals', goalId] as const,

  // `marks` (all of a user's marks) is a prefix of the by-goal and single-mark
  // keys on purpose: invalidating it drops every mark view at once.
  marks: (userId: string) => [ROOT, userId, 'marks'] as const,
  marksForGoal: (userId: string, goalId: string) =>
    [ROOT, userId, 'marks', 'by-goal', goalId] as const,
  // Marks grouped by goal for the list screens (Goals/Focus).
  marksByGoal: (userId: string) => [ROOT, userId, 'marks', 'by-goal-map'] as const,
  mark: (userId: string, markId: string) => [ROOT, userId, 'marks', 'by-id', markId] as const,

  checkins: (userId: string, markId: string) => [ROOT, userId, 'checkins', markId] as const,
  // Every live check-in the user owns — the query-layer equivalent of the old
  // eventsSlice `events` array that Goals/Focus read for weekly-completion math.
  userCheckins: (userId: string) => [ROOT, userId, 'checkins', 'all'] as const,
  todayCheckins: (userId: string, localDate: string) =>
    [ROOT, userId, 'checkins', 'today', localDate] as const,

  goalNotes: (userId: string, goalId: string) => [ROOT, userId, 'notes', goalId] as const,
} as const;

export type QueryKeys = typeof queryKeys;
