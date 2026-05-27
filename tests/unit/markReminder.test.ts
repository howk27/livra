import AsyncStorage from '@react-native-async-storage/async-storage';

// Mock expo-notifications before importing the module
jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn().mockResolvedValue('notification-id'),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  SchedulableTriggerInputTypes: { DAILY: 'daily' },
}));

import {
  getMarkReminderTime,
  setMarkReminderTime,
  clearMarkReminderTime,
  scheduleMarkReminder,
  cancelMarkReminder,
  markReminderTimeKey,
  REMINDER_NOTIF_ID_PREFIX,
} from '../../lib/notifications/markReminder';

const Notifications = require('expo-notifications');

beforeEach(() => {
  jest.clearAllMocks();
  (AsyncStorage as any).clear();
});

describe('markReminderTimeKey', () => {
  it('produces a namespaced key', () => {
    expect(markReminderTimeKey('abc')).toBe('@livra_reminder_time:abc');
  });
});

describe('getMarkReminderTime', () => {
  it('returns null when nothing is stored', async () => {
    expect(await getMarkReminderTime('mark1')).toBeNull();
  });

  it('returns the stored time', async () => {
    await AsyncStorage.setItem('@livra_reminder_time:mark1', '08:30');
    expect(await getMarkReminderTime('mark1')).toBe('08:30');
  });
});

describe('setMarkReminderTime', () => {
  it('persists the time string', async () => {
    await setMarkReminderTime('mark1', '09:00');
    expect(await AsyncStorage.getItem('@livra_reminder_time:mark1')).toBe('09:00');
  });
});

describe('clearMarkReminderTime', () => {
  it('removes the stored time', async () => {
    await AsyncStorage.setItem('@livra_reminder_time:mark1', '07:00');
    await clearMarkReminderTime('mark1');
    expect(await AsyncStorage.getItem('@livra_reminder_time:mark1')).toBeNull();
  });
});

describe('scheduleMarkReminder', () => {
  it('cancels any existing notification then schedules a new one', async () => {
    await scheduleMarkReminder('mark1', 'Deep Work', '08:30');

    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(
      `${REMINDER_NOTIF_ID_PREFIX}mark1`
    );
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: `${REMINDER_NOTIF_ID_PREFIX}mark1`,
        content: expect.objectContaining({
          body: 'Time to check in on Deep Work.',
          data: { screen: 'checkin', markId: 'mark1' },
        }),
        trigger: expect.objectContaining({ hour: 8, minute: 30 }),
      })
    );
  });

  it('parses hour and minute correctly', async () => {
    await scheduleMarkReminder('mark2', 'Sleep', '22:05');
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: expect.objectContaining({ hour: 22, minute: 5 }),
      })
    );
  });
});

describe('cancelMarkReminder', () => {
  it('cancels the scheduled notification', async () => {
    await cancelMarkReminder('mark1');
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(
      `${REMINDER_NOTIF_ID_PREFIX}mark1`
    );
  });

  it('does not throw if notification does not exist', async () => {
    Notifications.cancelScheduledNotificationAsync.mockRejectedValueOnce(new Error('not found'));
    await expect(cancelMarkReminder('mark1')).resolves.not.toThrow();
  });
});
