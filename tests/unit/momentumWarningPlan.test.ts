// tests/unit/momentumWarningPlan.test.ts
import {
  buildMomentumWarningInputs,
  hasMomentumWarningPlannedForToday,
} from '../../lib/notifications/momentumWarningPlan';

const goals = [{ id: 'g1', title: 'Run', status: 'active', linked_mark_ids: ['m1'] }];
// daily mark last logged 06-17 → warning fires on 06-19 (today)
const slipping = [{ id: 'm1', weekly_target: 7, last_activity_date: '2026-06-17', deleted_at: null }];
const fresh = [{ id: 'm1', weekly_target: 7, last_activity_date: null, deleted_at: null }];

describe('momentumWarningPlan', () => {
  it('builds one input for a slipping active goal', () => {
    const inputs = buildMomentumWarningInputs(goals, slipping, '2026-06-19');
    expect(inputs).toHaveLength(1);
    expect(inputs[0].goalId).toBe('g1');
    expect(inputs[0].title).toBe('Run');
  });

  it('ignores non-active goals', () => {
    const completed = [{ id: 'g1', title: 'Run', status: 'completed', linked_mark_ids: ['m1'] }];
    expect(buildMomentumWarningInputs(completed, slipping, '2026-06-19')).toHaveLength(0);
  });

  it('reports a warning planned for today when a goal is slipping', () => {
    expect(hasMomentumWarningPlannedForToday(goals, slipping, '2026-06-19')).toBe(true);
  });

  it('reports no warning when nothing is logged yet', () => {
    expect(hasMomentumWarningPlannedForToday(goals, fresh, '2026-06-19')).toBe(false);
  });
});
