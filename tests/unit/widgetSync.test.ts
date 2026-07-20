import { Platform } from 'react-native';

jest.mock('react-native-shared-group-preferences', () => ({
  __esModule: true,
  default: { setItem: jest.fn().mockResolvedValue(undefined) },
}));

const goalA = { id: 'goal-1', title: 'Run a 5K', status: 'active', sort_index: 0 };
const goalB = { id: 'goal-2', title: 'Read nightly', status: 'active', sort_index: 1 };

jest.mock('../../state/goalsSlice', () => ({
  useGoalsStore: {
    getState: jest.fn(() => ({
      goals: [goalB, goalA], // deliberately out of sort order
      getActiveGoals: () => [goalA, goalB], // canonical sorted accessor
      getGoalProgress: (id: string) =>
        id === 'goal-1'
          ? { progress: 4, threshold: 10 }
          : { progress: 2, threshold: 7 },
    })),
  },
}));

jest.mock('../../state/countersSlice', () => ({
  useMarksStore: {
    getState: jest.fn(() => ({
      marks: [
        { id: 'm1', name: 'Sleep', emoji: '😴', goal_id: 'goal-1', deleted_at: null },
        { id: 'm2', name: 'Drink water', emoji: '💧', goal_id: 'goal-1', deleted_at: null },
        { id: 'm3', name: 'Read', emoji: '📖', goal_id: 'goal-2', deleted_at: null },
      ],
    })),
  },
}));

jest.mock('../../lib/db', () => ({
  query: jest.fn().mockResolvedValue([{ mark_id: 'm1', count: 1 }]), // m1 logged today
}));
jest.mock('../../lib/iap/iap', () => ({
  checkProStatus: jest.fn().mockResolvedValue({ effectiveUnlocked: true }),
}));
jest.mock('../../lib/appDate', () => ({
  getAppDate: jest.fn(() => new Date('2026-05-30T12:00:00')),
}));

import SharedGroupPreferences from 'react-native-shared-group-preferences';
import { syncWidgetData, buildWidgetData } from '../../lib/widgets/widgetSync';
import { APP_GROUP_ID, WIDGET_DATA_KEY } from '../../lib/widgets/widgetTypes';

describe('buildWidgetData v2', () => {
  it('emits all active goals in getActiveGoals (sort_index) order', async () => {
    const data = await buildWidgetData();
    expect(data.goals.map((g) => g.id)).toEqual(['goal-1', 'goal-2']);
    expect(data.goals[0].title).toBe('Run a 5K');
    expect(data.isPro).toBe(true);
  });

  it('carries each goal its own days-progress ring and marks', async () => {
    const data = await buildWidgetData();
    const [g1, g2] = data.goals;
    expect(g1.progress).toBe(4);
    expect(g1.threshold).toBe(10);
    expect(g1.marks.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(g2.progress).toBe(2);
    expect(g2.threshold).toBe(7);
    expect(g2.marks.map((m) => m.id)).toEqual(['m3']);
  });

  it('flags today-completed marks per goal', async () => {
    const data = await buildWidgetData();
    const g1 = data.goals[0];
    expect(g1.marks.find((m) => m.id === 'm1')?.completed).toBe(true);
    expect(g1.marks.find((m) => m.id === 'm2')?.completed).toBe(false);
  });

  it('renders category glyph assets + accents, never raw emoji', async () => {
    const data = await buildWidgetData();
    const g1 = data.goals[0];
    expect(g1.marks.find((m) => m.id === 'm1')?.icon).toBe('livra_moon');
    expect(g1.marks.find((m) => m.id === 'm1')?.accent).toBe('#6B8FA6');
    expect(g1.icon).toMatch(/^livra_/);
    expect(JSON.stringify(data)).not.toMatch(/😴|💧|📖/);
  });

  it('skips active goals that have no marks', async () => {
    const { useGoalsStore } = require('../../state/goalsSlice');
    const empty = { id: 'goal-3', title: 'Empty', status: 'active', sort_index: 2 };
    useGoalsStore.getState.mockReturnValueOnce({
      goals: [goalA, empty],
      getActiveGoals: () => [goalA, empty],
      getGoalProgress: () => ({ progress: 0, threshold: 7 }),
    });
    const data = await buildWidgetData();
    expect(data.goals.map((g) => g.id)).toEqual(['goal-1']);
  });

  it('caps at 4 goals and 6 marks per goal', async () => {
    const { useGoalsStore } = require('../../state/goalsSlice');
    const { useMarksStore } = require('../../state/countersSlice');
    const many = Array.from({ length: 6 }, (_, i) => ({
      id: `g${i}`, title: `G${i}`, status: 'active', sort_index: i,
    }));
    useGoalsStore.getState.mockReturnValueOnce({
      goals: many,
      getActiveGoals: () => many,
      getGoalProgress: () => ({ progress: 0, threshold: 7 }),
    });
    useMarksStore.getState.mockReturnValueOnce({
      marks: Array.from({ length: 8 }, (_, i) => ({
        id: `g0m${i}`, name: `M${i}`, emoji: '', goal_id: 'g0', deleted_at: null,
      })),
    });
    const data = await buildWidgetData();
    expect(data.goals.length).toBeLessThanOrEqual(4);
    expect(data.goals[0].marks.length).toBe(6);
  });

  it('includes a goal with marks even if it is beyond the first 4 candidates (filter before cap)', async () => {
    const { useGoalsStore } = require('../../state/goalsSlice');
    const { useMarksStore } = require('../../state/countersSlice');
    // 6 goals: g0-g4 have no marks, g5 has marks at sort_index 5
    const goals = Array.from({ length: 6 }, (_, i) => ({
      id: `g${i}`, title: `Goal${i}`, status: 'active', sort_index: i,
    }));
    useGoalsStore.getState.mockReturnValueOnce({
      goals,
      getActiveGoals: () => goals,
      getGoalProgress: (id: string) => (id === 'g5'
        ? { progress: 3, threshold: 5 }
        : { progress: 0, threshold: 7 }),
    });
    useMarksStore.getState.mockReturnValueOnce({
      marks: [
        // Only g5 has marks
        { id: 'g5m1', name: 'Mark1', emoji: '📍', goal_id: 'g5', deleted_at: null },
        { id: 'g5m2', name: 'Mark2', emoji: '📍', goal_id: 'g5', deleted_at: null },
      ],
    });
    const data = await buildWidgetData();
    // g5 should be in the snapshot (not the 'today' fallback)
    expect(data.goals).toHaveLength(1);
    expect(data.goals[0].id).toBe('g5');
    expect(data.goals[0].progress).toBe(3);
    expect(data.goals[0].threshold).toBe(5);
    expect(data.goals[0].marks.map((m) => m.id)).toEqual(['g5m1', 'g5m2']);
  });

  it('falls back to a single "Today" goal when no active goal has marks', async () => {
    const { useGoalsStore } = require('../../state/goalsSlice');
    useGoalsStore.getState.mockReturnValueOnce({
      goals: [],
      getActiveGoals: () => [],
      getGoalProgress: () => ({ progress: 0, threshold: 7 }),
    });
    const data = await buildWidgetData();
    expect(data.goals).toHaveLength(1);
    expect(data.goals[0].id).toBe('today');
    expect(data.goals[0].marks.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
  });
});

describe('syncWidgetData', () => {
  it('writes v2 JSON (a goals array) to the App Group on iOS', async () => {
    Object.defineProperty(Platform, 'OS', { get: () => 'ios' });
    await syncWidgetData();
    expect(SharedGroupPreferences.setItem).toHaveBeenCalledWith(
      WIDGET_DATA_KEY,
      expect.stringContaining('"goals"'),
      APP_GROUP_ID,
    );
  });

  it('is a no-op on non-iOS', async () => {
    Object.defineProperty(Platform, 'OS', { get: () => 'android' });
    jest.clearAllMocks();
    await syncWidgetData();
    expect(SharedGroupPreferences.setItem).not.toHaveBeenCalled();
  });

  it('never throws if the native module is unavailable', async () => {
    Object.defineProperty(Platform, 'OS', { get: () => 'ios' });
    (SharedGroupPreferences.setItem as jest.Mock).mockRejectedValueOnce(new Error('x'));
    await expect(syncWidgetData()).resolves.not.toThrow();
  });
});
