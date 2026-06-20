// tests/unit/momentumWarningNotifications.test.ts
import * as Notifications from 'expo-notifications';
import { reconcileMomentumWarnings } from '../../services/momentumWarningNotifications';
import { useGoalsStore } from '../../state/goalsSlice';
import { useMarksStore } from '../../state/countersSlice';
import { cancelLivraScheduledByPrefix } from '../../lib/notifications/livraScheduledOwnership';

jest.mock('expo-notifications');
jest.mock('../../lib/notifications/livraScheduledOwnership', () => ({
  LIVRA_MOMENTUM_WARNING_ID_PREFIX: 'livra-mw-',
  cancelLivraScheduledByPrefix: jest.fn().mockResolvedValue(0),
}));
jest.mock('../../lib/notifications/livraReminderPrefs', () => ({
  getLivraRemindersEnabled: jest.fn().mockResolvedValue(true),
}));
// Fix "today" so date math is deterministic.
jest.mock('../../lib/appDate', () => ({ getAppDate: () => new Date('2026-06-19T10:00:00') }));

const setStores = (goals: any[], marks: any[]) => {
  useGoalsStore.setState({ goals } as any);
  useMarksStore.setState({ marks } as any);
};

describe('reconcileMomentumWarnings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (Notifications.scheduleNotificationAsync as jest.Mock).mockResolvedValue('id');
  });

  it('no-ops when userId is missing', async () => {
    setStores([], []);
    await reconcileMomentumWarnings(undefined);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('no-ops when OS permission is not granted', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
    setStores(
      [{ id: 'g1', title: 'Run', status: 'active', linked_mark_ids: ['m1'] }],
      [{ id: 'm1', weekly_target: 7, last_activity_date: '2026-06-17', deleted_at: null }],
    );
    await reconcileMomentumWarnings('u1');
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('cancels then schedules the future nudge for a slipping goal', async () => {
    setStores(
      [{ id: 'g1', title: 'Run', status: 'active', linked_mark_ids: ['m1'] }],
      // daily mark logged 06-17 → first/final collapse on 06-19 (today, window open at 10:00)
      [{ id: 'm1', weekly_target: 7, last_activity_date: '2026-06-17', deleted_at: null }],
    );
    await reconcileMomentumWarnings('u1');
    expect(cancelLivraScheduledByPrefix).toHaveBeenCalledWith('livra-mw-');
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const arg = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(arg.identifier).toMatch(/^livra-mw-2026-06-19-/);
    expect(arg.content.data.livraOwner).toBe(true);
    expect(arg.content.body).toContain('Run');
  });

  it('schedules nothing (only cancels) when no goal has a logged mark (recovery/fresh)', async () => {
    setStores(
      [{ id: 'g1', title: 'Run', status: 'active', linked_mark_ids: ['m1'] }],
      [{ id: 'm1', weekly_target: 7, last_activity_date: null, deleted_at: null }],
    );
    await reconcileMomentumWarnings('u1');
    expect(cancelLivraScheduledByPrefix).toHaveBeenCalledWith('livra-mw-');
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('ignores non-active goals (they drop out and get cancelled)', async () => {
    setStores(
      [{ id: 'g1', title: 'Run', status: 'completed', linked_mark_ids: ['m1'] }],
      [{ id: 'm1', weekly_target: 7, last_activity_date: '2026-06-17', deleted_at: null }],
    );
    await reconcileMomentumWarnings('u1');
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});
