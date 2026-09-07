// The Weekly Review's render gate — what the screen is allowed to do before its
// three reads have settled (root cause, 2026-09-08).
//
// THE BUG THIS PINS: `useGoals` / `useMarksByGoal` / `useUserCheckins` are all
// `enabled: userId !== ''`, and `userId` comes from `useAuth()`, which is a
// plain hook that starts at `user: null` and hydrates asynchronously — every
// call site gets its own instance. So on first render all three queries are
// DISABLED. In React Query v5 a disabled query is `isPending` but NOT
// `isFetching`, and `isLoading === isPending && isFetching` — therefore
// `isLoading` is FALSE while the data is genuinely absent.
//
// The screen computed `loading` from `isLoading`, so its "nothing to review"
// redirect fired on the very first render, before auth ever landed. That is the
// device symptom: `livra://review` flashes and bounces to Focus, and
// `weekly_review_null` ingests with goal_rows=0, active_goals=0,
// marks_by_goal_keys=0, checkin_rows=0, had_query_error=FALSE.
import fs from 'fs';
import path from 'path';

import { weeklyReviewGate } from '../../../lib/weeklyReview/gate';

/** Auth landed, all three reads resolved, one active goal, a review derived. */
const settled = {
  authSettled: true,
  hasUser: true,
  goalsPending: false,
  marksPending: false,
  checkinsPending: false,
  hasError: false,
  hasReview: true,
  activeGoalCount: 1,
};

/** The exact device state at first render: auth still hydrating, all three
 *  queries disabled (pending, not fetching), nothing derived, no error. */
const coldOpen = {
  authSettled: false,
  hasUser: false,
  goalsPending: true,
  marksPending: true,
  checkinsPending: true,
  hasError: false,
  hasReview: false,
  activeGoalCount: 0,
};

describe('weeklyReviewGate', () => {
  it('WAITS on a cold open — it must never redirect before auth settles', () => {
    // This is the whole bug. `isLoading` was false here; `isPending` is true.
    expect(weeklyReviewGate(coldOpen)).toBe('waiting');
  });

  it('waits while any one of the three reads is still pending', () => {
    expect(weeklyReviewGate({ ...settled, goalsPending: true })).toBe('waiting');
    expect(weeklyReviewGate({ ...settled, marksPending: true })).toBe('waiting');
    expect(weeklyReviewGate({ ...settled, checkinsPending: true })).toBe('waiting');
  });

  it('redirects a genuinely empty account, once the reads have actually settled', () => {
    expect(
      weeklyReviewGate({ ...settled, hasReview: false, activeGoalCount: 0 }),
    ).toBe('redirect');
  });

  it('does not wait forever when auth settles with no user', () => {
    // Queries stay disabled (pending) for a signed-out user, so the pending
    // check alone would spin a skeleton until the app was killed.
    expect(
      weeklyReviewGate({ ...coldOpen, authSettled: true, hasUser: false }),
    ).toBe('redirect');
  });

  it('shows the fallback on a read error rather than bouncing', () => {
    expect(weeklyReviewGate({ ...settled, hasError: true })).toBe('fallback');
    // An error must not be read as "nothing to review".
    expect(
      weeklyReviewGate({ ...settled, hasError: true, hasReview: false, activeGoalCount: 0 }),
    ).toBe('fallback');
  });

  it('shows the fallback when goals exist but no review could be derived', () => {
    expect(
      weeklyReviewGate({ ...settled, hasReview: false, activeGoalCount: 2 }),
    ).toBe('fallback');
  });

  it('renders the review when everything has landed', () => {
    expect(weeklyReviewGate(settled)).toBe('ready');
  });
});

describe('app/review/index.tsx wiring', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '../../../app/review/index.tsx'),
    'utf8',
  );

  it('routes its render through the gate', () => {
    expect(src).toContain('weeklyReviewGate');
  });

  it('never decides anything from isLoading', () => {
    // `isLoading` is the trap: false for a disabled query. The screen must read
    // `isPending` (via the gate) and nothing else.
    expect(src).not.toMatch(/\.isLoading/);
  });
});
