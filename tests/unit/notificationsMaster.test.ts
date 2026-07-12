// tests/unit/notificationsMaster.test.ts
import { applyNotificationsMaster } from '../../services/notificationsMaster';
import { setLivraRemindersEnabled } from '../../lib/notifications/livraReminderPrefs';
import { updateNotifications } from '../../services/notificationService';
import { reconcileMomentumWarnings } from '../../services/momentumWarningNotifications';
import { reconcileMarkReminders } from '../../lib/notifications/markReminder';
import { reconcileDailyReminder } from '../../lib/notifications/dailyReminder';

jest.mock('../../lib/notifications/livraReminderPrefs', () => ({
  setLivraRemindersEnabled: jest.fn().mockResolvedValue(undefined),
  getLivraRemindersEnabled: jest.fn().mockResolvedValue(true),
}));
jest.mock('../../services/notificationService', () => ({
  updateNotifications: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../services/momentumWarningNotifications', () => ({
  reconcileMomentumWarnings: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../lib/notifications/markReminder', () => ({
  reconcileMarkReminders: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../lib/notifications/dailyReminder', () => ({
  reconcileDailyReminder: jest.fn().mockResolvedValue(undefined),
}));

describe('applyNotificationsMaster', () => {
  beforeEach(() => jest.clearAllMocks());

  it('persists the pref and reconciles all four categories', async () => {
    const marks = [{ id: 'm1', name: 'Water' }];
    await applyNotificationsMaster(false, 'u1', marks);
    expect(setLivraRemindersEnabled).toHaveBeenCalledWith(false);
    expect(updateNotifications).toHaveBeenCalledWith('u1');
    expect(reconcileMomentumWarnings).toHaveBeenCalledWith('u1');
    expect(reconcileMarkReminders).toHaveBeenCalledWith(marks);
    expect(reconcileDailyReminder).toHaveBeenCalled();
  });
});
