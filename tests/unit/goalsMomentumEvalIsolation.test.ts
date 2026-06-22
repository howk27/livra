const mockEvaluate = jest.fn();
jest.mock('../../lib/goalMomentumStore', () => ({
  evaluateGoalMomentum: (...args: unknown[]) => mockEvaluate(...args),
}));

import { useGoalsStore } from '../../state/goalsSlice';
import { useMarksStore } from '../../state/countersSlice';
import { useMomentumStore } from '../../state/momentumSlice';

describe('evaluateActiveGoalsMomentum failure isolation', () => {
  beforeEach(() => {
    mockEvaluate.mockReset();
    useMarksStore.setState({ marks: [] });
    useMomentumStore.setState({ snapshots: {} });
    useGoalsStore.setState({
      goals: [
        { id: 'g1', status: 'active', linked_mark_ids: [] } as any,
        { id: 'g2', status: 'active', linked_mark_ids: [] } as any,
      ],
    });
  });

  it('keeps evaluating other goals when one throws', async () => {
    const okSnap = { state: 'building', days: 4, cushionRemaining: 2, slippingMarkId: null };
    mockEvaluate.mockImplementation((goalId: string) =>
      goalId === 'g1' ? Promise.reject(new Error('boom')) : Promise.resolve(okSnap)
    );

    const result = await useGoalsStore.getState().evaluateActiveGoalsMomentum();

    expect(result.has('g1')).toBe(false);
    expect(result.get('g2')).toEqual(okSnap);
    expect(useMomentumStore.getState().snapshots['g2']).toEqual(okSnap);
  });
});
