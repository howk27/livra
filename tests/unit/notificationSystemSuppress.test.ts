// tests/unit/notificationSystemSuppress.test.ts
import * as Notifications from 'expo-notifications';
import { scheduleContextualDailyNotification } from '../../lib/notificationSystem';
import { hasMomentumWarningPlannedForToday } from '../../lib/notifications/momentumWarningPlan';

jest.mock('expo-notifications');
jest.mock('../../lib/notifications/livraReminderPrefs', () => ({
  getLivraRemindersEnabled: jest.fn().mockResolvedValue(true),
}));
jest.mock('../../lib/db', () => ({ query: jest.fn().mockResolvedValue([]) }));
jest.mock('../../lib/notifications/momentumWarningPlan', () => ({
  hasMomentumWarningPlannedForToday: jest.fn(),
}));
jest.mock('../../lib/appDate', () => ({ getAppDate: () => new Date('2026-06-19T10:00:00') }));

describe('scheduleContextualDailyNotification at-risk suppression', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Notifications.cancelScheduledNotificationAsync as jest.Mock).mockResolvedValue(undefined);
    (Notifications.scheduleNotificationAsync as jest.Mock).mockResolvedValue('id');
  });

  it('suppresses the daily and cancels its own slot when today is at-risk', async () => {
    (hasMomentumWarningPlannedForToday as jest.Mock).mockReturnValue(true);
    await scheduleContextualDailyNotification('u1');
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(
      'livra-bn-contextual-daily',
    );
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('schedules the daily when today is not at-risk', async () => {
    (hasMomentumWarningPlannedForToday as jest.Mock).mockReturnValue(false);
    await scheduleContextualDailyNotification('u1');
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });
});
