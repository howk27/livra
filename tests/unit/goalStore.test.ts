import {
  isMarkCountComplete,
  isDeadlineExpired,
  progressPercent,
  getActiveGoal,
  getExpiredGoals,
} from '../../lib/goalLogic';
import type { Goal } from '../../types/goal';

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'g1',
    user_id: 'u1',
    title: 'Test goal',
    status: 'active',
    sort_index: 0,
    current_mark_count: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ── isMarkCountComplete ───────────────────────────────────────────────────────

describe('isMarkCountComplete', () => {
  test('false when no target set', () => {
    expect(isMarkCountComplete(makeGoal())).toBe(false);
  });

  test('false when current < target', () => {
    expect(isMarkCountComplete(makeGoal({ target_mark_count: 10, current_mark_count: 5 }))).toBe(false);
  });

  test('true when current === target', () => {
    expect(isMarkCountComplete(makeGoal({ target_mark_count: 10, current_mark_count: 10 }))).toBe(true);
  });

  test('true when current > target', () => {
    expect(isMarkCountComplete(makeGoal({ target_mark_count: 10, current_mark_count: 15 }))).toBe(true);
  });

  test('false when target_mark_count is null', () => {
    expect(isMarkCountComplete(makeGoal({ target_mark_count: null, current_mark_count: 5 }))).toBe(false);
  });

  test('false when target_mark_count is 0', () => {
    expect(isMarkCountComplete(makeGoal({ target_mark_count: 0, current_mark_count: 0 }))).toBe(false);
  });
});

// ── isDeadlineExpired ─────────────────────────────────────────────────────────

describe('isDeadlineExpired', () => {
  test('false when no deadline', () => {
    expect(isDeadlineExpired(makeGoal())).toBe(false);
  });

  test('false when deadline is in the future', () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect(isDeadlineExpired(makeGoal({ deadline_date: future }))).toBe(false);
  });

  test('true when deadline has passed and status is active', () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    expect(isDeadlineExpired(makeGoal({ deadline_date: past }))).toBe(true);
  });

  test('false when deadline has passed but status is completed', () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    expect(isDeadlineExpired(makeGoal({ deadline_date: past, status: 'completed' }))).toBe(false);
  });

  test('false when deadline has passed but status is paused', () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    expect(isDeadlineExpired(makeGoal({ deadline_date: past, status: 'paused' }))).toBe(false);
  });

  test('falls back to target_date when deadline_date absent', () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    expect(isDeadlineExpired(makeGoal({ target_date: past }))).toBe(true);
  });
});

// ── progressPercent ───────────────────────────────────────────────────────────

describe('progressPercent', () => {
  test('0 when no target', () => {
    expect(progressPercent(makeGoal())).toBe(0);
  });

  test('50 at half way', () => {
    expect(progressPercent(makeGoal({ target_mark_count: 10, current_mark_count: 5 }))).toBe(50);
  });

  test('100 at completion', () => {
    expect(progressPercent(makeGoal({ target_mark_count: 10, current_mark_count: 10 }))).toBe(100);
  });

  test('capped at 100 when over target', () => {
    expect(progressPercent(makeGoal({ target_mark_count: 10, current_mark_count: 15 }))).toBe(100);
  });

  test('0 when target is 0 to avoid division by zero', () => {
    expect(progressPercent(makeGoal({ target_mark_count: 0, current_mark_count: 5 }))).toBe(0);
  });
});

// ── getActiveGoal / getExpiredGoals ───────────────────────────────────────────

describe('getActiveGoal', () => {
  test('returns the first active goal by sort_index', () => {
    const goals = [
      makeGoal({ id: 'g1', status: 'active', sort_index: 1 }),
      makeGoal({ id: 'g2', status: 'active', sort_index: 0 }),
    ];
    expect(getActiveGoal(goals)?.id).toBe('g2');
  });

  test('returns undefined when no active goal', () => {
    const goals = [makeGoal({ id: 'g1', status: 'completed', sort_index: 0 })];
    expect(getActiveGoal(goals)).toBeUndefined();
  });
});

describe('getExpiredGoals', () => {
  test('returns expired goals', () => {
    const goals = [
      makeGoal({ id: 'g1', status: 'active' }),
      makeGoal({ id: 'g2', status: 'expired', updated_at: '2026-05-01T00:00:00Z' }),
      makeGoal({ id: 'g3', status: 'expired', updated_at: '2026-06-01T00:00:00Z' }),
    ];
    const result = getExpiredGoals(goals);
    expect(result.map(g => g.id)).toEqual(['g3', 'g2']);
  });
});

// ── GoalStatus: expired and paused are valid ──────────────────────────────────

describe('GoalStatus types', () => {
  test('expired and paused goals are excluded from active queries', () => {
    const goals = [
      makeGoal({ id: 'g1', status: 'active' }),
      makeGoal({ id: 'g2', status: 'expired' }),
      makeGoal({ id: 'g3', status: 'paused' }),
    ];
    expect(getActiveGoal(goals)?.id).toBe('g1');
  });
});

// ── useGoalsStore: active-only model ─────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useGoalsStore } from '../../state/goalsSlice';

const STORE_USER = 'u-store';

async function resetStore() {
  await AsyncStorage.clear();
  useGoalsStore.setState({ goals: [], isLoading: false, error: null } as any);
}

// Mock loadGoalsForUser for fetchGoals normalization test
jest.mock('../../lib/db/goalsDb', () => {
  const original = jest.requireActual('../../lib/db/goalsDb');
  return {
    ...original,
    loadGoalsForUser: jest.fn().mockResolvedValue([
      {
        id: 'legacy-1', user_id: 'u-store', title: 'Legacy', sort_index: 0,
        status: 'queued', current_mark_count: 0,
        created_at: '2026-01-01', updated_at: '2026-01-01',
      },
    ]),
  };
});

beforeEach(resetStore);

test('createGoal makes every new goal active (no queue)', async () => {
  const s = useGoalsStore.getState();
  await s.createGoal({ userId: STORE_USER, isPro: false, title: 'One' });
  await s.createGoal({ userId: STORE_USER, isPro: false, title: 'Two' });
  const statuses = useGoalsStore.getState().goals.map(g => g.status);
  expect(statuses).toEqual(['active', 'active']);
});

test('free tier blocks a third active goal', async () => {
  const s = useGoalsStore.getState();
  await s.createGoal({ userId: STORE_USER, isPro: false, title: 'One' });
  await s.createGoal({ userId: STORE_USER, isPro: false, title: 'Two' });
  await expect(
    s.createGoal({ userId: STORE_USER, isPro: false, title: 'Three' })
  ).rejects.toThrow(/2 goals/);
});

test('fetchGoals normalizes legacy queued goals to active', async () => {
  // loadGoalsForUser mocked to return a goal with status 'queued'
  await useGoalsStore.getState().fetchGoals(STORE_USER);
  expect(useGoalsStore.getState().goals.every(g => g.status !== 'queued')).toBe(true);
});

test('checkGoalCompletion never auto-completes on mark count (founder 2026-07-18: user declares)', async () => {
  const s = useGoalsStore.getState();
  const a = await s.createGoal({
    userId: STORE_USER, isPro: false, title: 'Counted', target_mark_count: 1,
  });
  useGoalsStore.setState(st => ({
    goals: st.goals.map(g => (g.id === a.id ? { ...g, current_mark_count: 5 } : g)),
  }));
  await useGoalsStore.getState().checkGoalCompletion(a.id);
  expect(useGoalsStore.getState().goals.find(g => g.id === a.id)?.status).toBe('active');
});

test('getGoalProgress reports readyToClaim at the commitment target, from day-based progress', async () => {
  const { useEventsStore } = require('../../state/eventsSlice');
  const s = useGoalsStore.getState();
  const a = await s.createGoal({
    userId: STORE_USER, isPro: false, title: 'Claimable', target_mark_count: 2,
    linked_mark_ids: [],
  });
  useGoalsStore.setState(st => ({
    goals: st.goals.map(g => (g.id === a.id ? { ...g, linked_mark_ids: ['m1'] } : g)),
  }));
  const ev = (d: string, id: string) => ({
    id, user_id: STORE_USER, mark_id: 'm1', event_type: 'increment', amount: 1,
    occurred_at: `${d}T10:00:00Z`, occurred_local_date: d,
    created_at: `${d}T10:00:00Z`, updated_at: `${d}T10:00:00Z`,
  });
  // 5 taps across 2 days: progress must be 2 (days), not 5 (taps).
  useEventsStore.setState({
    events: [
      ev('2026-07-01', 'e1'), ev('2026-07-01', 'e2'), ev('2026-07-01', 'e3'),
      ev('2026-07-02', 'e4'), ev('2026-07-02', 'e5'),
    ],
  });
  const p = useGoalsStore.getState().getGoalProgress(a.id);
  expect(p.progress).toBe(2);
  expect(p.readyToClaim).toBe(true);
  useEventsStore.setState({ events: [] });
});

test('completing one goal leaves other active goals active (no auto-activation)', async () => {
  const s = useGoalsStore.getState();
  const a = await s.createGoal({ userId: STORE_USER, isPro: false, title: 'A' });
  await s.createGoal({ userId: STORE_USER, isPro: false, title: 'B' });
  await s.completeGoal(a.id);
  const after = useGoalsStore.getState().goals;
  expect(after.find(g => g.id === a.id)?.status).toBe('completed');
  expect(after.filter(g => g.status === 'active')).toHaveLength(1);
});
