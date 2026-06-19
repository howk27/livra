import { presentMomentum } from '../../lib/momentumPresenter';
import type { MomentumSnapshot } from '../../lib/goalMomentum';

const snap = (over: Partial<MomentumSnapshot>): MomentumSnapshot => ({
  state: 'on_track', days: 5, cushionRemaining: null, slippingMarkId: null, ...over,
});

describe('presentMomentum', () => {
  it('fresh-start for null, zero days, or broken', () => {
    expect(presentMomentum(null)).toEqual({ visual: 'fresh', label: 'Fresh start', cushion: null });
    expect(presentMomentum(snap({ days: 0 }))).toEqual({ visual: 'fresh', label: 'Fresh start', cushion: null });
    expect(presentMomentum(snap({ state: 'broken', days: 0 }))).toEqual({ visual: 'fresh', label: 'Fresh start', cushion: null });
  });
  it('glow when on_track with a running count', () => {
    expect(presentMomentum(snap({ state: 'on_track', days: 12 }))).toEqual({ visual: 'glow', label: 'Momentum · 12 days', cushion: null });
  });
  it('neutral when resting', () => {
    expect(presentMomentum(snap({ state: 'resting', days: 4 }))).toEqual({ visual: 'neutral', label: 'Momentum · 4 days', cushion: null });
  });
  it('gauge with cushion when slipping', () => {
    expect(presentMomentum(snap({ state: 'slipping', days: 6, cushionRemaining: 0.5 }))).toEqual({ visual: 'gauge', label: 'Momentum · 6 days', cushion: 0.5 });
  });
  it('singular day', () => {
    expect(presentMomentum(snap({ state: 'on_track', days: 1 })).label).toBe('Momentum · 1 day');
  });
  it('slipping with null cushion falls back to 0 fill', () => {
    expect(presentMomentum(snap({ state: 'slipping', days: 3, cushionRemaining: null }))).toEqual({ visual: 'gauge', label: 'Momentum · 3 days', cushion: 0 });
  });
});
