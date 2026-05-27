import { getMilestonesToFire } from '../../lib/goalMilestones';
import type { Goal } from '../../types/goal';

const BASE_GOAL: Goal = {
  id: 'g1',
  user_id: 'u1',
  title: 'Test Goal',
  status: 'active',
  sort_index: 0,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

// Adds N days to Jan 1 2026 noon UTC — avoids midnight boundary issues
const daysAfterCreated = (days: number): Date =>
  new Date(new Date('2026-01-01T12:00:00.000Z').getTime() + days * 24 * 60 * 60 * 1000);

describe('getMilestonesToFire — dated goals', () => {
  // target_date is '2026-05-01' = 120 days after created_at
  // 25% = day 30, 50% = day 60, 75% = day 90
  const datedGoal: Goal = { ...BASE_GOAL, target_date: '2026-05-01' };

  it('returns [] before the 25% threshold', () => {
    expect(getMilestonesToFire(datedGoal, daysAfterCreated(29))).toEqual([]);
  });

  it("returns ['25'] at the 25% threshold", () => {
    expect(getMilestonesToFire(datedGoal, daysAfterCreated(30))).toEqual(['25']);
  });

  it('does not re-fire a milestone already in milestones_fired', () => {
    const goal = { ...datedGoal, milestones_fired: ['25'] };
    expect(getMilestonesToFire(goal, daysAfterCreated(30))).toEqual([]);
  });

  it("returns ['50'] at the 50% threshold when '25' already fired", () => {
    const goal = { ...datedGoal, milestones_fired: ['25'] };
    expect(getMilestonesToFire(goal, daysAfterCreated(60))).toEqual(['50']);
  });

  it("returns ['75'] at the 75% threshold when '25' and '50' already fired", () => {
    const goal = { ...datedGoal, milestones_fired: ['25', '50'] };
    expect(getMilestonesToFire(goal, daysAfterCreated(90))).toEqual(['75']);
  });

  it('returns multiple keys when multiple thresholds are crossed simultaneously', () => {
    expect(getMilestonesToFire(datedGoal, daysAfterCreated(90))).toEqual(['25', '50', '75']);
  });

  it('returns [] when target_date equals created_at (zero-length goal)', () => {
    const goal = { ...BASE_GOAL, target_date: '2026-01-01' };
    expect(getMilestonesToFire(goal, daysAfterCreated(1))).toEqual([]);
  });
});

describe('getMilestonesToFire — dateless goals', () => {
  it('returns [] before day 7', () => {
    expect(getMilestonesToFire(BASE_GOAL, daysAfterCreated(6))).toEqual([]);
  });

  it("returns ['7'] at day 7", () => {
    expect(getMilestonesToFire(BASE_GOAL, daysAfterCreated(7))).toEqual(['7']);
  });

  it("returns ['30'] at day 30 when '7' already fired", () => {
    const goal = { ...BASE_GOAL, milestones_fired: ['7'] };
    expect(getMilestonesToFire(goal, daysAfterCreated(30))).toEqual(['30']);
  });

  it("returns ['60'] at day 60 when '7' and '30' already fired", () => {
    const goal = { ...BASE_GOAL, milestones_fired: ['7', '30'] };
    expect(getMilestonesToFire(goal, daysAfterCreated(60))).toEqual(['60']);
  });

  it('returns multiple keys when multiple thresholds are crossed simultaneously', () => {
    expect(getMilestonesToFire(BASE_GOAL, daysAfterCreated(60))).toEqual(['7', '30', '60']);
  });
});

describe('getMilestonesToFire — status guard', () => {
  it('returns [] for queued goals', () => {
    const goal: Goal = { ...BASE_GOAL, status: 'queued' };
    expect(getMilestonesToFire(goal, daysAfterCreated(90))).toEqual([]);
  });

  it('returns [] for completed goals', () => {
    const goal: Goal = { ...BASE_GOAL, status: 'completed', completed_at: '2026-03-01T00:00:00.000Z' };
    expect(getMilestonesToFire(goal, daysAfterCreated(90))).toEqual([]);
  });
});
