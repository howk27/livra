// tests/unit/markReminderMasterGating.test.ts
import * as Notifications from 'expo-notifications';
import {
  scheduleMarkReminder,
  reconcileMarkReminders,
  setMarkReminderTime,
} from '../../lib/notifications/markReminder';
import { getLivraRemindersEnabled } from '../../lib/notifications/livraReminderPrefs';

jest.mock('expo-notifications');
jest.mock('../../lib/notifications/livraReminderPrefs', () => ({
  getLivraRemindersEnabled: jest.fn(),
}));

describe('markReminder master gating', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Notifications.scheduleNotificationAsync as jest.Mock).mockResolvedValue('id');
    (Notifications.cancelScheduledNotificationAsync as jest.Mock).mockResolvedValue(undefined);
  });

  it('scheduleMarkReminder no-ops when the master is off', async () => {
    (getLivraRemindersEnabled as jest.Mock).mockResolvedValue(false);
    await scheduleMarkReminder('m1', 'Water', '08:30');
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('scheduleMarkReminder schedules when the master is on', async () => {
    (getLivraRemindersEnabled as jest.Mock).mockResolvedValue(true);
    await scheduleMarkReminder('m1', 'Water', '08:30');
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const arg = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(arg.identifier).toBe('livra-reminder-m1');
    expect(arg.trigger.hour).toBe(8);
    expect(arg.trigger.minute).toBe(30);
  });

  it('reconcileMarkReminders cancels all marks when the master is off', async () => {
    (getLivraRemindersEnabled as jest.Mock).mockResolvedValue(false);
    await reconcileMarkReminders([
      { id: 'm1', name: 'Water' },
      { id: 'm2', name: 'Run' },
    ]);
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('livra-reminder-m1');
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('livra-reminder-m2');
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('reconcileMarkReminders reschedules from stored times when on, skips marks with no time and deleted marks', async () => {
    (getLivraRemindersEnabled as jest.Mock).mockResolvedValue(true);
    await setMarkReminderTime('m1', '09:15');
    await reconcileMarkReminders([
      { id: 'm1', name: 'Water' },
      { id: 'm2', name: 'Run' }, // no stored time → skip
      { id: 'm3', name: 'Gone', deleted_at: '2026-06-01' }, // deleted → skip
    ]);
    const scheduled = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls.map(
      (c) => c[0].identifier,
    );
    expect(scheduled).toEqual(['livra-reminder-m1']);
  });
});
