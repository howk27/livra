import { useMomentumStore } from '../../state/momentumSlice';
import type { MomentumSnapshot } from '../../lib/goalMomentum';

const snap = (over: Partial<MomentumSnapshot> = {}): MomentumSnapshot => ({
  state: 'on_track', days: 5, cushionRemaining: null, slippingMarkId: null, ...over,
});

beforeEach(() => useMomentumStore.setState({ snapshots: {} }));

describe('useMomentumStore', () => {
  it('sets and reads a snapshot by goalId', () => {
    useMomentumStore.getState().setSnapshot('g1', snap({ days: 7 }));
    expect(useMomentumStore.getState().snapshots['g1'].days).toBe(7);
  });
  it('overwrites the snapshot for the same goal', () => {
    useMomentumStore.getState().setSnapshot('g1', snap({ days: 1 }));
    useMomentumStore.getState().setSnapshot('g1', snap({ days: 2 }));
    expect(useMomentumStore.getState().snapshots['g1'].days).toBe(2);
  });
  it('clears a goal snapshot without touching others', () => {
    useMomentumStore.getState().setSnapshot('g1', snap());
    useMomentumStore.getState().setSnapshot('g2', snap());
    useMomentumStore.getState().clearSnapshot('g1');
    expect(useMomentumStore.getState().snapshots['g1']).toBeUndefined();
    expect(useMomentumStore.getState().snapshots['g2']).toBeDefined();
  });
});
