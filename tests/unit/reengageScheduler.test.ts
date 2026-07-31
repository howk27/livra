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
// M9 Phase 5A Task 6: the scheduler reads the query cache through the singleton
// client — membership through links, activity derived from events.
import { queryClient } from '../../lib/data/queryClient';
import { queryKeys } from '../../lib/data/queryKeys';
import { scheduleReengageNudge, REENGAGE_TITLE } from '../../lib/notifications/reengageNudge';
import AsyncStorage from '@react-native-async-storage/async-storage';

const USER = 'u1';
const localDate = (daysBack: number) => {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  return d.toISOString().slice(0, 10);
};

function seedCache(lastIncrementDaysBack: number) {
  queryClient.setQueryData(queryKeys.goals(USER), [
    { id: 'g1', user_id: USER, title: 'Goal', status: 'active' },
  ]);
  queryClient.setQueryData(queryKeys.marksByGoal(USER), {
    g1: [{ id: 'm1', user_id: USER, name: 'Mark', deleted_at: null }],
  });
  queryClient.setQueryData(queryKeys.userCheckins(USER), [
    {
      id: 'e1',
      user_id: USER,
      mark_id: 'm1',
      event_type: 'increment',
      occurred_at: `${localDate(lastIncrementDaysBack)}T10:00:00Z`,
      occurred_local_date: localDate(lastIncrementDaysBack),
      deleted_at: null,
    },
  ]);
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  queryClient.clear();
  seedCache(8);
});

describe('scheduleReengageNudge', () => {
  it('schedules the nudge when idle >= 7 days', async () => {
    await scheduleReengageNudge(USER);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const arg = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(arg.content.title).toBe(REENGAGE_TITLE);
  });

  it('schedules nothing when the master toggle is off', async () => {
    (getLivraRemindersEnabled as jest.Mock).mockResolvedValueOnce(false);
    await scheduleReengageNudge(USER);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('livra-bn-reengage');
  });

  it('schedules nothing when not idle long enough', async () => {
    seedCache(0); // logged today
    await scheduleReengageNudge(USER);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});
