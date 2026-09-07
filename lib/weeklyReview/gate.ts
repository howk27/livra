// lib/weeklyReview/gate.ts — what the Weekly Review is allowed to render.
//
// Extracted 2026-09-08 from app/review/index.tsx, where the "nothing to review"
// redirect was computed inline from React Query's `isLoading`.
//
// `isLoading` is `isPending && isFetching`. A DISABLED query (`enabled: false`)
// is pending but never fetching, so `isLoading` is FALSE for it — the screen
// read that as "settled, and empty". All three of the review's reads are
// `enabled: userId !== ''` (lib/data/goals.ts, marks.ts, checkins.ts) and
// `userId` comes from `useAuth()`, a per-call-site hook that starts null and
// hydrates asynchronously, so all three ARE disabled on first render. The
// redirect fired before auth landed and the review bounced to Focus every time.
//
// The rule this module exists to hold: nothing may be concluded from absent
// data until the reads have actually settled. Pure — the screen supplies the
// flags, this decides.

export type WeeklyReviewGate =
  /** Reads have not settled. Show the skeleton; conclude nothing. */
  | 'waiting'
  /** Settled, but there is no review to draw (error, or a derive that returned null). */
  | 'fallback'
  /** Settled, and there is genuinely nothing to review. Leave for Focus. */
  | 'redirect'
  /** Settled, with a review. */
  | 'ready';

export interface WeeklyReviewGateInputs {
  /** `useAuth().initialized` — true once auth resolved to a user or to no user. */
  authSettled: boolean;
  /** Whether that resolution produced a user. */
  hasUser: boolean;
  /** React Query `isPending` — true while a query is disabled OR in flight. */
  goalsPending: boolean;
  marksPending: boolean;
  checkinsPending: boolean;
  /** Any of the three reads failed. */
  hasError: boolean;
  /** deriveWeeklyReview() returned something. */
  hasReview: boolean;
  /** Live, active goals the screen can see. */
  activeGoalCount: number;
}

export function weeklyReviewGate(input: WeeklyReviewGateInputs): WeeklyReviewGate {
  // Auth is upstream of all three reads; until it lands, "no goals" means
  // "not asked yet". This is the line whose absence caused the bug.
  if (!input.authSettled) return 'waiting';

  // Signed out, definitively: the queries stay disabled forever, so waiting on
  // them would spin a skeleton until the app was killed. The app's own auth
  // gate owns this case — the review just steps aside.
  if (!input.hasUser) return 'redirect';

  if (input.goalsPending || input.marksPending || input.checkinsPending) return 'waiting';

  // An error is not an empty week. Say so, and keep the user where they are.
  if (input.hasError) return 'fallback';

  if (!input.hasReview) {
    return input.activeGoalCount === 0 ? 'redirect' : 'fallback';
  }

  return 'ready';
}
