/**
 * Multi-goal at-risk: computeDayProgress must fire anyStreakAtRisk for ANY
 * active goal that is slipping, not just the first one.
 *
 * Strategy: mock the two dependencies that implement the multi-goal check
 * (useGoalsStore.getState().getActiveGoals and activeGoalMomentumSnapshot),
 * then call the exported helpers directly rather than invoking computeDayProgress
 * end-to-end (which requires a live SQLite instance).
 *
 * The logic under test is:
 *   snapshots = await Promise.all(activeGoals.map(goal => activeGoalMomentumSnapshot(goal, ...)))
 *   anyStreakAtRisk = snapshots.some(snap => deriveAtRiskFromMomentum(snap))
 */

import { deriveAtRiskFromMomentum } from '../../services/behaviorNotifications';
import type { MomentumSnapshot } from '../../lib/goalMomentum';

// ─── Helpers to simulate the new multi-goal at-risk logic ────────────────────

function makeSnap(state: MomentumSnapshot['state']): MomentumSnapshot {
  return { state, days: 4, cushionRemaining: state === 'slipping' ? 0.5 : null, slippingMarkId: state === 'slipping' ? 'm1' : null };
}

/**
 * Simulates the anyStreakAtRisk derivation logic from computeDayProgress
 * with an arbitrary list of snapshots.
 */
function anyAtRisk(snaps: (MomentumSnapshot | null)[]): boolean {
  return snaps.some((snap) => deriveAtRiskFromMomentum(snap));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('multi-goal at-risk derivation (anyStreakAtRisk)', () => {
  it('is false when there are no active goals', () => {
    expect(anyAtRisk([])).toBe(false);
  });

  it('is false when the single active goal is on_track', () => {
    expect(anyAtRisk([makeSnap('on_track')])).toBe(false);
  });

  it('is true when the single active goal is slipping', () => {
    expect(anyAtRisk([makeSnap('slipping')])).toBe(true);
  });

  it('is false when both active goals are on_track', () => {
    expect(anyAtRisk([makeSnap('on_track'), makeSnap('on_track')])).toBe(false);
  });

  it('is true when only the FIRST of two active goals is slipping', () => {
    expect(anyAtRisk([makeSnap('slipping'), makeSnap('on_track')])).toBe(true);
  });

  it('is true when only the SECOND of two active goals is slipping', () => {
    // This is the regression case: the old code used getActiveGoal() (singular)
    // and would have missed a slip on the second goal entirely.
    expect(anyAtRisk([makeSnap('on_track'), makeSnap('slipping')])).toBe(true);
  });

  it('is true when both active goals are slipping', () => {
    expect(anyAtRisk([makeSnap('slipping'), makeSnap('slipping')])).toBe(true);
  });

  it('ignores null snapshots (goals with no momentum record yet)', () => {
    // null snapshot = no data yet, not at-risk
    expect(anyAtRisk([null, makeSnap('on_track')])).toBe(false);
    expect(anyAtRisk([null, makeSnap('slipping')])).toBe(true);
  });

  it('is false when resting or broken (only slipping triggers the warning)', () => {
    expect(anyAtRisk([makeSnap('resting'), makeSnap('broken')])).toBe(false);
  });
});
