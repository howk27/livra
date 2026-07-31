/**
 * M9 Phase 5A Task 6 — hooks/useCompleteGoal.ts, the completion chain.
 *
 * Ports the claims of the retired store suites (goalCompletionBanking,
 * maintenanceCompleteGoal) onto the query-era owner:
 *   1. The cached momentum snapshot's day-count is BANKED onto the completion
 *      write (0 when there is no snapshot), and the snapshot is cleared AFTER.
 *   2. The goal's marks convert to maintenance — a server write now — and the
 *      marks reads are re-invalidated once the stamp lands.
 *   3. A failed conversion never fails the completion (decoration rule).
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const mockMutateAsync = jest.fn().mockResolvedValue(undefined);
jest.mock('../../lib/data/mutations/goals', () => ({
  useCompleteGoalMutation: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));
jest.mock('../../lib/data/mutations/marks', () => ({
  convertGoalMarksToMaintenance: jest.fn().mockResolvedValue(undefined),
}));
const mockInvalidateQueries = jest.fn();
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));
jest.mock('../../lib/analytics/posthog', () => ({ capture: jest.fn() }));

/* eslint-disable import/first -- jest.mock factories must precede these imports */
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useCompleteGoal } from '../../hooks/useCompleteGoal';
import { convertGoalMarksToMaintenance } from '../../lib/data/mutations/marks';
import { useMomentumStore } from '../../state/momentumSlice';
/* eslint-enable import/first */

const goal = { id: 'g1', user_id: 'u1', created_at: '2026-06-01T00:00:00Z' };

beforeEach(() => {
  jest.clearAllMocks();
  mockMutateAsync.mockResolvedValue(undefined);
  useMomentumStore.setState({ snapshots: {} });
});

describe('useCompleteGoal', () => {
  it('banks the cached snapshot day-count and clears the snapshot after the write', async () => {
    useMomentumStore.setState({
      snapshots: {
        g1: { state: 'on_track', days: 12, cushionRemaining: null, slippingMarkId: null },
      },
    } as never);

    const { result } = renderHook(() => useCompleteGoal('u1'));
    await act(() => result.current.completeGoal(goal));

    expect(mockMutateAsync).toHaveBeenCalledWith({ goalId: 'g1', bankedMomentumDays: 12 });
    expect(useMomentumStore.getState().snapshots['g1']).toBeUndefined();
  });

  it('banks 0 when the goal has no cached snapshot', async () => {
    const { result } = renderHook(() => useCompleteGoal('u1'));
    await act(() => result.current.completeGoal(goal));
    expect(mockMutateAsync).toHaveBeenCalledWith({ goalId: 'g1', bankedMomentumDays: 0 });
  });

  it('converts the goal’s marks to maintenance and re-invalidates marks after the stamp', async () => {
    const { result } = renderHook(() => useCompleteGoal('u1'));
    await act(() => result.current.completeGoal(goal));

    expect(convertGoalMarksToMaintenance).toHaveBeenCalledWith('g1');
    await waitFor(() =>
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['livra', 'u1', 'marks'] }),
    );
  });

  it('a failed conversion never fails the completion', async () => {
    jest.mocked(convertGoalMarksToMaintenance).mockRejectedValueOnce(new Error('injected'));
    const { result } = renderHook(() => useCompleteGoal('u1'));
    await expect(act(() => result.current.completeGoal(goal))).resolves.not.toThrow();
  });

  it('a failed completion write DOES throw — and converts nothing', async () => {
    mockMutateAsync.mockRejectedValueOnce(new Error('refused'));
    const { result } = renderHook(() => useCompleteGoal('u1'));
    await expect(act(() => result.current.completeGoal(goal))).rejects.toThrow('refused');
    expect(convertGoalMarksToMaintenance).not.toHaveBeenCalled();
  });
});
