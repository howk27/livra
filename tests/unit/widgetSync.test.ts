import { Platform } from 'react-native';

jest.mock('react-native-shared-group-preferences', () => ({
  __esModule: true,
  default: { setItem: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('../../state/goalsSlice', () => ({
  useGoalsStore: {
    getState: jest.fn(() => ({
      getActiveGoal: () => ({ id: 'goal-1', title: 'Run a 5K', icon: '🏃' }),
      getGoalProgress: () => ({ progress: 4, threshold: 10, canComplete: false }),
    })),
  },
}));

jest.mock('../../state/countersSlice', () => ({
  useMarksStore: {
    getState: jest.fn(() => ({
      marks: [
        // '😴' → category 'sleep' → moon.fill / recovery accent.
        { id: 'mark-1', name: 'Sleep', emoji: '😴', goal_id: 'goal-1', deleted_at: null },
        // '💧' → category 'water' → drop.fill / health accent.
        { id: 'mark-2', name: 'Drink water', emoji: '💧', goal_id: 'goal-1', deleted_at: null },
      ],
    })),
  },
}));

jest.mock('../../lib/db', () => ({
  query: jest.fn().mockResolvedValue([{ mark_id: 'mark-1', count: 1 }]),
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

describe('buildWidgetData', () => {
  it('returns active goal title and marks with completion state', async () => {
    const data = await buildWidgetData();
    expect(data.activeGoalTitle).toBe('Run a 5K');
    expect(data.goalProgress).toBe(4);
    expect(data.goalThreshold).toBe(10);
    expect(data.marks).toHaveLength(2);
    expect(data.marks.find(m => m.id === 'mark-1')?.completed).toBe(true);
    expect(data.marks.find(m => m.id === 'mark-2')?.completed).toBe(false);
    expect(data.completedCount).toBe(1);
    expect(data.totalCount).toBe(2);
    expect(data.isPro).toBe(true);
  });

  it('renders category SF Symbols + accents (never raw emoji) for marks and goal', async () => {
    const data = await buildWidgetData();

    const sleep = data.marks.find(m => m.id === 'mark-1');
    expect(sleep?.symbol).toBe('moon.fill');
    expect(sleep?.accent).toBe('#6B8FA6'); // categoryAccents.recovery

    const water = data.marks.find(m => m.id === 'mark-2');
    expect(water?.symbol).toBe('drop.fill');
    expect(water?.accent).toBe('#4A8C7A'); // categoryAccents.health

    // Goal icon = majority category across the goal's marks; the tie resolves to
    // the first category in mark order ('sleep').
    expect(data.goalSymbol).toBe('moon.fill');
    expect(data.goalAccent).toBe('#6B8FA6');

    // No raw emoji leaks into the widget payload.
    expect(JSON.stringify(data)).not.toMatch(/😴|💧|🏃/);
  });

  it('handles no active goal gracefully', async () => {
    const { useGoalsStore } = require('../../state/goalsSlice');
    useGoalsStore.getState.mockReturnValueOnce({ getActiveGoal: () => undefined });
    const data = await buildWidgetData();
    expect(data.activeGoalTitle).toBeNull();
    expect(data.goalProgress).toBe(0);
    expect(data.goalThreshold).toBe(7);
    // Falls back to a category symbol (from remaining marks), never empty/emoji.
    expect(typeof data.goalSymbol).toBe('string');
    expect(data.goalSymbol.length).toBeGreaterThan(0);
    expect(data.goalAccent).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });
});

describe('syncWidgetData', () => {
  it('writes JSON to App Group on iOS', async () => {
    Object.defineProperty(Platform, 'OS', { get: () => 'ios' });
    await syncWidgetData();
    expect(SharedGroupPreferences.setItem).toHaveBeenCalledWith(
      WIDGET_DATA_KEY,
      expect.stringContaining('"activeGoalTitle"'),
      APP_GROUP_ID,
    );
  });

  it('is a no-op on non-iOS platforms', async () => {
    Object.defineProperty(Platform, 'OS', { get: () => 'android' });
    jest.clearAllMocks();
    await syncWidgetData();
    expect(SharedGroupPreferences.setItem).not.toHaveBeenCalled();
  });

  it('does not throw if the native module is unavailable', async () => {
    Object.defineProperty(Platform, 'OS', { get: () => 'ios' });
    const mock = SharedGroupPreferences as jest.Mocked<typeof SharedGroupPreferences>;
    mock.setItem.mockRejectedValueOnce(new Error('module unavailable'));
    await expect(syncWidgetData()).resolves.not.toThrow();
  });
});
