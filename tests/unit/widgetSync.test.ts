import { Platform } from 'react-native';

jest.mock('react-native-shared-group-preferences', () => ({
  __esModule: true,
  default: { setItem: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('../../state/goalsSlice', () => ({
  useGoalsStore: {
    getState: jest.fn(() => ({
      getActiveGoal: () => ({ id: 'goal-1', title: 'Run a 5K' }),
    })),
  },
}));

jest.mock('../../state/countersSlice', () => ({
  useMarksStore: {
    getState: jest.fn(() => ({
      marks: [
        { id: 'mark-1', name: 'Workout', emoji: '💪', color: '#10B981', deleted_at: null },
        { id: 'mark-2', name: 'Sleep', emoji: '😴', color: '#3B82F6', deleted_at: null },
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
    expect(data.marks).toHaveLength(2);
    expect(data.marks.find(m => m.id === 'mark-1')?.completed).toBe(true);
    expect(data.marks.find(m => m.id === 'mark-2')?.completed).toBe(false);
    expect(data.completedCount).toBe(1);
    expect(data.totalCount).toBe(2);
    expect(data.isPro).toBe(true);
  });

  it('handles no active goal gracefully', async () => {
    const { useGoalsStore } = require('../../state/goalsSlice');
    useGoalsStore.getState.mockReturnValueOnce({ getActiveGoal: () => undefined });
    const data = await buildWidgetData();
    expect(data.activeGoalTitle).toBeNull();
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
