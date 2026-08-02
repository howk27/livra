/**
 * Widget snapshot builder — M9 Phase 5A: reads the QUERY LAYER, not the deleted
 * stores/mock DB. The cache is seeded directly (ensureQueryData serves cached
 * data without fetching), so these are the same behavioural contracts as the v2
 * widget rework, computed from rows:
 *  • all active goals in sort_index order, each with its own ring + marks
 *  • rings derive from events via calculateGoalProgress (threshold = commitment)
 *  • today-completed flags from occurred_local_date
 *  • category glyphs, never raw emoji
 *  • filter-before-cap (a goal with marks beyond the first 4 candidates survives)
 *  • goal-less fallback covers ALL marks, linked or not
 */
import { Platform } from 'react-native';

jest.mock('react-native-shared-group-preferences', () => ({
  __esModule: true,
  default: { setItem: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('../../lib/supabase', () => ({
  getSupabaseClient: jest.fn(() => ({
    auth: {
      getSession: jest.fn(async () => ({
        data: { session: { user: { id: 'user-1' } } },
      })),
    },
  })),
}));

jest.mock('../../lib/iap/iap', () => ({
  checkProStatus: jest.fn().mockResolvedValue({ effectiveUnlocked: true }),
}));
jest.mock('../../lib/appDate', () => ({
  getAppDate: jest.fn(() => new Date('2026-05-30T12:00:00')),
}));

/* eslint-disable import/first -- jest.mock factories must precede these imports */
import SharedGroupPreferences from 'react-native-shared-group-preferences';
import { syncWidgetData, buildWidgetData } from '../../lib/widgets/widgetSync';
import { APP_GROUP_ID, WIDGET_DATA_KEY } from '../../lib/widgets/widgetTypes';
import { queryClient } from '../../lib/data/queryClient';
import { queryKeys } from '../../lib/data/queryKeys';
import type { GoalRow, MarkRow, MarkEventRow } from '../../lib/data/types';
/* eslint-enable import/first */

const USER = 'user-1';
const NOW = '2026-05-30T10:00:00.000Z';

const goalRow = (over: Partial<GoalRow>): GoalRow =>
  ({
    id: 'g',
    user_id: USER,
    title: 'Goal',
    description: null,
    icon: null,
    color: null,
    status: 'active',
    tier: null,
    frequency: null,
    target_mark_count: null,
    current_mark_count: 0,
    sort_index: 0,
    deadline_date: null,
    completed_at: null,
    banked_momentum_days: 0,
    milestones_fired: null,
    created_at: '2026-05-01T00:00:00.000Z',
    updated_at: NOW,
    deleted_at: null,
    ...over,
  }) as GoalRow;

const markRow = (over: Partial<MarkRow>): MarkRow =>
  ({
    id: 'm',
    user_id: USER,
    name: 'Mark',
    emoji: null,
    color: null,
    unit: 'sessions',
    sort_index: 0,
    enable_streak: false,
    last_activity_date: null,
    maintenance_of: null,
    frequency_kind: null,
    frequency_min: null,
    frequency_recommended: null,
    frequency_max: null,
    weekly_target: null,
    dailyTarget: null,
    created_at: '2026-05-01T00:00:00.000Z',
    updated_at: NOW,
    deleted_at: null,
    ...over,
  }) as MarkRow;

const eventRow = (markId: string, localDate: string, id: string): MarkEventRow =>
  ({
    id,
    user_id: USER,
    mark_id: markId,
    event_type: 'increment',
    amount: 1,
    occurred_at: `${localDate}T09:00:00.000Z`,
    occurred_local_date: localDate,
    meta: null,
    created_at: `${localDate}T09:00:00.000Z`,
    updated_at: `${localDate}T09:00:00.000Z`,
    deleted_at: null,
  }) as MarkEventRow;

// Canonical fixture: two active goals with commitments, three linked marks,
// events giving goal-1 three mark-days (m1×2 + m2×1) and goal-2 one.
const goalA = goalRow({ id: 'goal-1', title: 'Run a 5K', sort_index: 0, target_mark_count: 10 });
const goalB = goalRow({ id: 'goal-2', title: 'Read nightly', sort_index: 1, target_mark_count: 7 });
const m1 = markRow({ id: 'm1', name: 'Sleep', emoji: '😴' });
const m2 = markRow({ id: 'm2', name: 'Drink water', emoji: '💧' });
const m3 = markRow({ id: 'm3', name: 'Read', emoji: '📖' });
const EVENTS = [
  eventRow('m1', '2026-05-30', 'e1'), // m1 logged TODAY
  eventRow('m1', '2026-05-29', 'e2'),
  eventRow('m2', '2026-05-28', 'e3'),
  eventRow('m3', '2026-05-30', 'e4'),
];

type Seed = {
  goals?: GoalRow[];
  byGoal?: Record<string, MarkRow[]>;
  marks?: MarkRow[];
  events?: MarkEventRow[];
};

function seed({ goals, byGoal, marks, events }: Seed = {}) {
  queryClient.setQueryData(queryKeys.goals(USER), goals ?? [goalB, goalA]);
  queryClient.setQueryData(
    queryKeys.marksByGoal(USER),
    byGoal ?? { 'goal-1': [m1, m2], 'goal-2': [m3] },
  );
  queryClient.setQueryData(queryKeys.marks(USER), marks ?? [m1, m2, m3]);
  queryClient.setQueryData(queryKeys.userCheckins(USER), events ?? EVENTS);
}

beforeEach(() => {
  queryClient.clear();
  jest.clearAllMocks();
});

// The real queryClient's 24h gcTime would otherwise leave live GC timers after
// the last test and keep the jest process from exiting.
afterEach(() => {
  queryClient.clear();
});

describe('buildWidgetData v2 (query-layer)', () => {
  it('emits all active goals in sort_index order', async () => {
    seed();
    const data = await buildWidgetData();
    expect(data.goals.map((g) => g.id)).toEqual(['goal-1', 'goal-2']);
    expect(data.goals[0].title).toBe('Run a 5K');
    expect(data.isPro).toBe(true);
  });

  it('carries each goal its own days-progress ring and marks', async () => {
    seed();
    const data = await buildWidgetData();
    const [g1, g2] = data.goals;
    // m1 on two days + m2 on one day = 3 mark-days; threshold = the commitment.
    expect(g1.progress).toBe(3);
    expect(g1.threshold).toBe(10);
    expect(g1.marks.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(g2.progress).toBe(1);
    expect(g2.threshold).toBe(7);
    expect(g2.marks.map((m) => m.id)).toEqual(['m3']);
  });

  it('flags whether the threshold is a commitment or the unlock floor', async () => {
    // The widget captions its done state "N / M check-in days" only for a real
    // commitment (goals.tsx:262); without this flag it cannot tell the two
    // thresholds apart, since both arrive as the same number. Both canonical
    // goals carry target_mark_count, so the false case needs a goal without one.
    const uncommitted = goalRow({ id: 'goal-3', title: 'Just tracking', sort_index: 2 });
    seed({
      goals: [goalA, uncommitted],
      byGoal: { 'goal-1': [m1, m2], 'goal-3': [m3] },
    });
    const data = await buildWidgetData();
    const byId = Object.fromEntries(data.goals.map((g) => [g.id, g]));
    expect(byId['goal-1'].hasCommitment).toBe(true);
    expect(byId['goal-3'].hasCommitment).toBe(false);
    // And the threshold still lands — the flag describes it, never gates it.
    expect(byId['goal-3'].threshold).toBeGreaterThanOrEqual(1);
  });

  it('flags today-completed marks per goal', async () => {
    seed();
    const data = await buildWidgetData();
    const g1 = data.goals[0];
    expect(g1.marks.find((m) => m.id === 'm1')?.completed).toBe(true);
    expect(g1.marks.find((m) => m.id === 'm2')?.completed).toBe(false);
  });

  it('renders category glyph assets + accents, never raw emoji', async () => {
    seed();
    const data = await buildWidgetData();
    const g1 = data.goals[0];
    expect(g1.marks.find((m) => m.id === 'm1')?.icon).toBe('livra_moon');
    expect(g1.marks.find((m) => m.id === 'm1')?.accent).toBe('#6B8FA6');
    expect(g1.icon).toMatch(/^livra_/);
    expect(JSON.stringify(data)).not.toMatch(/😴|💧|📖/);
  });

  it('skips active goals that have no marks', async () => {
    const empty = goalRow({ id: 'goal-3', title: 'Empty', sort_index: 2 });
    seed({ goals: [goalA, empty], byGoal: { 'goal-1': [m1, m2] } });
    const data = await buildWidgetData();
    expect(data.goals.map((g) => g.id)).toEqual(['goal-1']);
  });

  it('caps at 4 goals and 6 marks per goal', async () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      goalRow({ id: `g${i}`, title: `G${i}`, sort_index: i }),
    );
    const g0marks = Array.from({ length: 8 }, (_, i) => markRow({ id: `g0m${i}`, name: `M${i}` }));
    const byGoal = Object.fromEntries(many.map((g) => [g.id, g.id === 'g0' ? g0marks : [m1]]));
    seed({ goals: many, byGoal, marks: g0marks, events: [] });
    const data = await buildWidgetData();
    expect(data.goals.length).toBeLessThanOrEqual(4);
    expect(data.goals[0].marks.length).toBe(6);
  });

  it('includes a goal with marks even if it is beyond the first 4 candidates (filter before cap)', async () => {
    // 6 goals: g0-g4 have no marks, g5 has two marks and one event today.
    const goals = Array.from({ length: 6 }, (_, i) =>
      goalRow({ id: `g${i}`, title: `Goal${i}`, sort_index: i, target_mark_count: 5 }),
    );
    const g5m1 = markRow({ id: 'g5m1', name: 'Mark1' });
    const g5m2 = markRow({ id: 'g5m2', name: 'Mark2' });
    seed({
      goals,
      byGoal: { g5: [g5m1, g5m2] },
      marks: [g5m1, g5m2],
      events: [eventRow('g5m1', '2026-05-30', 'e5')],
    });
    const data = await buildWidgetData();
    expect(data.goals).toHaveLength(1);
    expect(data.goals[0].id).toBe('g5');
    expect(data.goals[0].progress).toBe(1);
    expect(data.goals[0].threshold).toBe(5);
    expect(data.goals[0].marks.map((m) => m.id)).toEqual(['g5m1', 'g5m2']);
  });

  it('falls back to a single "Today" goal over ALL marks when no active goal has marks', async () => {
    // No goals at all — but the user owns marks. The fallback must see them
    // even though none is linked (marksByGoal is empty).
    seed({ goals: [], byGoal: {}, marks: [m1, m2, m3] });
    const data = await buildWidgetData();
    expect(data.goals).toHaveLength(1);
    expect(data.goals[0].id).toBe('today');
    expect(data.goals[0].marks.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
  });

  it('returns an empty snapshot when signed out', async () => {
    const { getSupabaseClient } = jest.requireMock('../../lib/supabase') as {
      getSupabaseClient: jest.Mock;
    };
    getSupabaseClient.mockReturnValueOnce({
      auth: { getSession: jest.fn(async () => ({ data: { session: null } })) },
    });
    const data = await buildWidgetData();
    expect(data.goals).toEqual([]);
    expect(data.isPro).toBe(false);
  });
});

describe('syncWidgetData', () => {
  it('writes v2 JSON (a goals array) to the App Group on iOS', async () => {
    seed();
    Object.defineProperty(Platform, 'OS', { get: () => 'ios' });
    await syncWidgetData();
    expect(SharedGroupPreferences.setItem).toHaveBeenCalledWith(
      WIDGET_DATA_KEY,
      expect.stringContaining('"goals"'),
      APP_GROUP_ID,
    );
  });

  it('is a no-op on non-iOS', async () => {
    seed();
    Object.defineProperty(Platform, 'OS', { get: () => 'android' });
    await syncWidgetData();
    expect(SharedGroupPreferences.setItem).not.toHaveBeenCalled();
  });

  it('never throws if the native module is unavailable', async () => {
    seed();
    Object.defineProperty(Platform, 'OS', { get: () => 'ios' });
    (SharedGroupPreferences.setItem as jest.Mock).mockRejectedValueOnce(new Error('x'));
    await expect(syncWidgetData()).resolves.not.toThrow();
  });
});
