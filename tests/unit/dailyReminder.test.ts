import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DAILY_REMINDER_NOTIF_ID,
  DAILY_REMINDER_TIME_KEY,
  getDailyReminderTime,
  setDailyReminderTime,
  clearDailyReminderTime,
  scheduleDailyReminder,
  cancelDailyReminder,
  reconcileDailyReminder,
} from '../../lib/notifications/dailyReminder';
import { getLivraRemindersEnabled } from '../../lib/notifications/livraReminderPrefs';

jest.mock('expo-notifications');
jest.mock('../../lib/notifications/livraReminderPrefs', () => ({
  getLivraRemindersEnabled: jest.fn(),
}));

describe('dailyReminder', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    (Notifications.scheduleNotificationAsync as jest.Mock).mockResolvedValue('id');
    (Notifications.cancelScheduledNotificationAsync as jest.Mock).mockResolvedValue(undefined);
    (getLivraRemindersEnabled as jest.Mock).mockResolvedValue(true);
  });

  it('round-trips the stored time', async () => {
    expect(await getDailyReminderTime()).toBeNull();
    await setDailyReminderTime('9:30');
    expect(await getDailyReminderTime()).toBe('9:30');
    expect(await AsyncStorage.getItem(DAILY_REMINDER_TIME_KEY)).toBe('9:30');
    await clearDailyReminderTime();
    expect(await getDailyReminderTime()).toBeNull();
  });

  it('schedules a daily trigger at the stored hour and minute', async () => {
    await scheduleDailyReminder('9:30');
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const arg = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(arg.identifier).toBe(DAILY_REMINDER_NOTIF_ID);
    expect(arg.trigger).toMatchObject({ hour: 9, minute: 30 });
    expect(arg.content.body).not.toMatch(/[—–]/);
  });

  it('no-ops scheduling when the master toggle is off', async () => {
    (getLivraRemindersEnabled as jest.Mock).mockResolvedValue(false);
    await scheduleDailyReminder('9:30');
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('cancelDailyReminder cancels by the fixed identifier', async () => {
    await cancelDailyReminder();
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(
      DAILY_REMINDER_NOTIF_ID,
    );
  });

  describe('reconcileDailyReminder', () => {
    it('schedules when enabled and a time is stored', async () => {
      await setDailyReminderTime('20:00');
      await reconcileDailyReminder();
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    });

    it('cancels when the master is off', async () => {
      (getLivraRemindersEnabled as jest.Mock).mockResolvedValue(false);
      await setDailyReminderTime('20:00');
      await reconcileDailyReminder();
      expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
      expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(
        DAILY_REMINDER_NOTIF_ID,
      );
    });

    it('cancels when no time is stored', async () => {
      await reconcileDailyReminder();
      expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
      expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(
        DAILY_REMINDER_NOTIF_ID,
      );
    });
  });
});
