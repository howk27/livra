// tests/unit/useNotificationsMaster.test.ts
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useNotificationsMaster } from '../../hooks/useNotificationsMaster';

// --- mocks ---
jest.mock('../../services/notificationsMaster', () => ({
  applyNotificationsMaster: jest.fn(),
}));

jest.mock('../../lib/notifications/livraReminderPrefs', () => ({
  getLivraRemindersEnabled: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../hooks/useAuth', () => ({
  useAuth: jest.fn().mockReturnValue({ user: { id: 'u1' } }),
}));

jest.mock('../../state/countersSlice', () => ({
  useMarksStore: Object.assign(jest.fn().mockReturnValue([]), {
    getState: jest.fn().mockReturnValue({ marks: [] }),
  }),
}));

jest.mock('../../lib/utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    log: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
  },
}));

// eslint-disable-next-line import/first
import { applyNotificationsMaster } from '../../services/notificationsMaster';
// eslint-disable-next-line import/first
import { logger } from '../../lib/utils/logger';

const mockApply = applyNotificationsMaster as jest.MockedFunction<typeof applyNotificationsMaster>;
const mockWarn = logger.warn as jest.MockedFunction<typeof logger.warn>;

describe('useNotificationsMaster', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApply.mockResolvedValue(undefined);
  });

  it('Test A – success: setEnabled(false) persists false and calls applyNotificationsMaster once', async () => {
    const { result } = renderHook(() => useNotificationsMaster());

    // Wait for hydration
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.enabled).toBe(true);

    await act(async () => {
      await result.current.setEnabled(false);
    });

    expect(result.current.enabled).toBe(false);
    expect(mockApply).toHaveBeenCalledTimes(1);
    expect(mockApply).toHaveBeenCalledWith(false, 'u1', []);
  });

  it('Test B – failure/rollback: setEnabled(false) reverts to true when applyNotificationsMaster rejects', async () => {
    mockApply.mockRejectedValueOnce(new Error('permissions denied'));

    const { result } = renderHook(() => useNotificationsMaster());

    // Wait for hydration
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.enabled).toBe(true);

    await act(async () => {
      await result.current.setEnabled(false);
    });

    // Should have reverted to prior value (true)
    expect(result.current.enabled).toBe(true);
    // logger.warn should have been called
    expect(mockWarn).toHaveBeenCalled();
    // No unhandled rejection — if setEnabled threw, act() would surface it
  });
});
