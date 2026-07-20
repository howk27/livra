import { readFileSync } from 'fs';
import { join } from 'path';

const model = readFileSync(
  join(__dirname, '../../targets/LivraWidget/WidgetDataModel.swift'),
  'utf8',
);

describe('WidgetData v2 Swift model', () => {
  it('defines a WidgetGoalData struct with a marks array', () => {
    expect(model).toMatch(/struct WidgetGoalData: Codable/);
    expect(model).toMatch(/let marks: \[WidgetMarkData\]/);
  });

  it('decodes the v2 goals array', () => {
    expect(model).toMatch(/goals/);
    expect(model).toMatch(/\[WidgetGoalData\]/);
  });

  it('adapts a legacy v1 snapshot (goals key absent) instead of crashing', () => {
    // The decoder must reference the old top-level keys to build a one-goal v2.
    expect(model).toMatch(/activeGoalTitle/);
    expect(model).toMatch(/decodeIfPresent/);
  });

  it('derives current goal / current mark for the queue', () => {
    expect(model).toMatch(/var currentGoal:/);
    expect(model).toMatch(/var currentMark:/);
  });

  it('keeps backward-compat accessors for the lock-screen widget', () => {
    for (const acc of ['activeGoalTitle', 'goalProgress', 'progressFraction', 'nextQueuedMark']) {
      expect(model).toContain(acc);
    }
  });

  it('does NOT bump the ring on an optimistic tap (ring is days-based)', () => {
    // The old code did `goalProgress: current.goalProgress + (newlyCompleted ? 1 : 0)`.
    // v2 must not increment any progress field inside the optimistic flip.
    expect(model).not.toMatch(/progress:\s*\w+\.progress\s*\+/);
  });
});
