/**
 * completeOnboarding remote-sync resilience (launch walk 2026-07-08).
 *
 * Root cause found live: column-level UPDATE grants on public.profiles deny
 * onboarding_focus_area / onboarding_completed_at (42501) while
 * onboarding_completed alone succeeds. The critical flag must land even when
 * the metadata columns are denied, and the pending-retry key must reflect
 * whether a retry is still needed.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const mockUpdate = jest.fn();
const mockSingle = jest.fn();
jest.mock('../../lib/supabase', () => ({
  getSupabaseClient: () => ({
    from: () => ({
      update: (payload: Record<string, unknown>) => ({
        eq: () => mockUpdate(payload),
      }),
      select: () => ({
        eq: () => ({
          single: () => mockSingle(),
        }),
      }),
    }),
  }),
}));
jest.mock('../../lib/utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), debug: jest.fn(), info: jest.fn() },
}));

process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';

import {
  useUIStore,
  ONBOARDING_REMOTE_PENDING_KEY,
  ONBOARDING_COMPLETED_STORAGE_KEY,
} from '../../state/uiSlice';

describe('completeOnboarding remote sync', () => {
  beforeEach(async () => {
    mockUpdate.mockReset();
    mockSingle.mockReset();
    await AsyncStorage.clear();
  });

  it('sends the full payload and clears the pending key on success', async () => {
    mockUpdate.mockResolvedValue({ error: null });
    const ok = await useUIStore.getState().completeOnboarding('uid-1', {
      commitment: 'steady',
      completedAt: '2026-07-08T00:00:00Z',
    });
    expect(ok).toBe(true);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith({
      onboarding_completed: true,
      onboarding_focus_area: 'steady',
      onboarding_completed_at: '2026-07-08T00:00:00Z',
    });
    expect(await AsyncStorage.getItem(ONBOARDING_REMOTE_PENDING_KEY)).toBeNull();
  });

  it('falls back to the minimal payload when the full update is denied, keeps pending for metadata', async () => {
    mockUpdate
      .mockResolvedValueOnce({ error: { code: '42501', message: 'permission denied for table profiles' } })
      .mockResolvedValueOnce({ error: null });

    const ok = await useUIStore.getState().completeOnboarding('uid-1', {
      commitment: 'steady',
      completedAt: '2026-07-08T00:00:00Z',
    });

    expect(ok).toBe(true); // the critical flag landed
    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(mockUpdate).toHaveBeenLastCalledWith({ onboarding_completed: true });
    // metadata still unsynced -> retry stays pending
    expect(await AsyncStorage.getItem(ONBOARDING_REMOTE_PENDING_KEY)).toBe('1');
  });

  it('returns false and sets pending when even the minimal update fails', async () => {
    mockUpdate.mockResolvedValue({ error: { code: '42501', message: 'denied' } });

    const ok = await useUIStore.getState().completeOnboarding('uid-1', {
      commitment: 'steady',
    });

    expect(ok).toBe(false);
    expect(await AsyncStorage.getItem(ONBOARDING_REMOTE_PENDING_KEY)).toBe('1');
    // local completion still applies
    expect(useUIStore.getState().isOnboarded).toBe(true);
  });

  it('retries the critical flag on loadUIState while a remote sync is pending, clears on success', async () => {
    await AsyncStorage.setItem(ONBOARDING_REMOTE_PENDING_KEY, '1');
    await AsyncStorage.setItem(ONBOARDING_COMPLETED_STORAGE_KEY, 'true');
    mockUpdate.mockResolvedValue({ error: null });
    mockSingle.mockResolvedValue({ data: { onboarding_completed: false }, error: null });

    await useUIStore.getState().loadUIState('uid-1');

    expect(mockUpdate).toHaveBeenCalledWith({ onboarding_completed: true });
    expect(await AsyncStorage.getItem(ONBOARDING_REMOTE_PENDING_KEY)).toBeNull();
  });

  it('keeps the pending key on loadUIState when the retry fails', async () => {
    await AsyncStorage.setItem(ONBOARDING_REMOTE_PENDING_KEY, '1');
    await AsyncStorage.setItem(ONBOARDING_COMPLETED_STORAGE_KEY, 'true');
    mockUpdate.mockResolvedValue({ error: { code: '42501', message: 'denied' } });
    mockSingle.mockResolvedValue({ data: { onboarding_completed: false }, error: null });

    await useUIStore.getState().loadUIState('uid-1');

    expect(await AsyncStorage.getItem(ONBOARDING_REMOTE_PENDING_KEY)).toBe('1');
  });
});
