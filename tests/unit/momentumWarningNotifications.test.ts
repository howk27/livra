// tests/unit/momentumWarningNotifications.test.ts
//
// M9 Phase 5A Task 6: the reconcile reads the query cache through the singleton
// client — goals + links resolve membership, per-mark activity derives from the
// check-in events (the stored last_activity_date column is retired).
import * as Notifications from 'expo-notifications';
import { reconcileMomentumWarnings } from '../../services/momentumWarningNotifications';
import { queryClient } from '../../lib/data/queryClient';
import { queryKeys } from '../../lib/data/queryKeys';
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

const USER = 'u1';

/** Seed goals + one linked mark, with `lastActivity` expressed as an event. */
const seedCache = (
  goals: { id: string; title: string; status: string }[],
  mark: { id: string; weekly_target: number | null },
  lastActivity: string | null,
) => {
  queryClient.setQueryData(
    queryKeys.goals(USER),
    goals.map((g) => ({ ...g, user_id: USER })),
  );
  queryClient.setQueryData(
    queryKeys.marksByGoal(USER),
    Object.fromEntries(
      goals.map((g) => [g.id, [{ ...mark, user_id: USER, name: 'Run mark', deleted_at: null }]]),
    ),
  );
  queryClient.setQueryData(
    queryKeys.userCheckins(USER),
    lastActivity
      ? [
          {
            id: 'e1',
            user_id: USER,
            mark_id: mark.id,
            event_type: 'increment',
            occurred_at: `${lastActivity}T09:00:00Z`,
            occurred_local_date: lastActivity,
            deleted_at: null,
          },
        ]
      : [],
  );
};

describe('reconcileMomentumWarnings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (Notifications.scheduleNotificationAsync as jest.Mock).mockResolvedValue('id');
  });

  it('no-ops when userId is missing', async () => {
    await reconcileMomentumWarnings(undefined);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('no-ops when OS permission is not granted', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
    seedCache([{ id: 'g1', title: 'Run', status: 'active' }], { id: 'm1', weekly_target: 7 }, '2026-06-17');
    await reconcileMomentumWarnings(USER);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('cancels then schedules the future nudge for a slipping goal', async () => {
    // daily mark logged 06-17 → first/final collapse on 06-19 (today, window open at 10:00)
    seedCache([{ id: 'g1', title: 'Run', status: 'active' }], { id: 'm1', weekly_target: 7 }, '2026-06-17');
    await reconcileMomentumWarnings(USER);
    expect(cancelLivraScheduledByPrefix).toHaveBeenCalledWith('livra-mw-');
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const arg = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(arg.identifier).toMatch(/^livra-mw-2026-06-19-/);
    expect(arg.content.data.livraOwner).toBe(true);
    expect(arg.content.body).toContain('Run');
  });

  it('schedules nothing (only cancels) when no goal has a logged mark (recovery/fresh)', async () => {
    seedCache([{ id: 'g1', title: 'Run', status: 'active' }], { id: 'm1', weekly_target: 7 }, null);
    await reconcileMomentumWarnings(USER);
    expect(cancelLivraScheduledByPrefix).toHaveBeenCalledWith('livra-mw-');
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('ignores non-active goals (they drop out and get cancelled)', async () => {
    seedCache([{ id: 'g1', title: 'Run', status: 'completed' }], { id: 'm1', weekly_target: 7 }, '2026-06-17');
    await reconcileMomentumWarnings(USER);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});
