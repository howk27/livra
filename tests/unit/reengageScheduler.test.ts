jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('id-1'),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));
jest.mock('../../lib/notifications/livraReminderPrefs', () => ({ getLivraRemindersEnabled: jest.fn().mockResolvedValue(true) }));
jest.mock('../../lib/notifications/momentumWarningPlan', () => ({ hasMomentumWarningPlannedForToday: jest.fn().mockReturnValue(false) }));

import * as Notifications from 'expo-notifications';
import { getLivraRemindersEnabled } from '../../lib/notifications/livraReminderPrefs';
import { useGoalsStore } from '../../state/goalsSlice';
import { useMarksStore } from '../../state/countersSlice';
import { scheduleReengageNudge, REENGAGE_TITLE } from '../../lib/notifications/reengageNudge';
import AsyncStorage from '@react-native-async-storage/async-storage';

const eightDaysAgo = (() => { const d = new Date(); d.setDate(d.getDate() - 8); return d.toISOString().slice(0, 10); })();

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  useGoalsStore.setState({ goals: [{ id: 'g1', status: 'active', linked_mark_ids: ['m1'] } as any] });
  useMarksStore.setState({ marks: [{ id: 'm1', goal_id: 'g1', deleted_at: null, last_activity_date: eightDaysAgo } as any] });
});

describe('scheduleReengageNudge', () => {
  it('schedules the nudge when idle >= 7 days', async () => {
    await scheduleReengageNudge('u1');
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const arg = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(arg.content.title).toBe(REENGAGE_TITLE);
  });

  it('schedules nothing when the master toggle is off', async () => {
    (getLivraRemindersEnabled as jest.Mock).mockResolvedValueOnce(false);
    await scheduleReengageNudge('u1');
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('livra-bn-reengage');
  });

  it('schedules nothing when not idle long enough', async () => {
    useMarksStore.setState({ marks: [{ id: 'm1', goal_id: 'g1', deleted_at: null, last_activity_date: new Date().toISOString().slice(0, 10) } as any] });
    await scheduleReengageNudge('u1');
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});
