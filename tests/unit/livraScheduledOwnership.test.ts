// tests/unit/livraScheduledOwnership.test.ts
import * as Notifications from 'expo-notifications';
import {
  LIVRA_MOMENTUM_WARNING_ID_PREFIX,
  cancelLivraScheduledByPrefix,
  cancelAllLivraScheduledNotifications,
} from '../../lib/notifications/livraScheduledOwnership';

jest.mock('expo-notifications');

const mockPending = (ids: string[]) =>
  (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue(
    ids.map((identifier) => ({ identifier, content: { data: {} } })),
  );

describe('namespace split', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Notifications.cancelScheduledNotificationAsync as jest.Mock).mockResolvedValue(undefined);
  });

  it('exposes the momentum-warning prefix', () => {
    expect(LIVRA_MOMENTUM_WARNING_ID_PREFIX).toBe('livra-mw-');
  });

  it('cancelLivraScheduledByPrefix cancels only matching prefix', async () => {
    mockPending(['livra-bn-2026-06-19-win-0', 'livra-mw-2026-06-19-0']);
    const n = await cancelLivraScheduledByPrefix('livra-bn-');
    expect(n).toBe(1);
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(
      'livra-bn-2026-06-19-win-0',
    );
    expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalledWith(
      'livra-mw-2026-06-19-0',
    );
  });

  it('master cancelAll cancels both bn and mw', async () => {
    mockPending(['livra-bn-2026-06-19-win-0', 'livra-mw-2026-06-19-0']);
    const n = await cancelAllLivraScheduledNotifications();
    expect(n).toBe(2);
  });
});
