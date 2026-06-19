// tests/unit/behaviorMomentumAtRisk.test.ts
import { deriveAtRiskFromMomentum } from '../../services/behaviorNotifications';

describe('deriveAtRiskFromMomentum', () => {
  it('is true only when the snapshot is slipping', () => {
    expect(deriveAtRiskFromMomentum({ state: 'slipping', days: 4, cushionRemaining: 0.5, slippingMarkId: 'm1' })).toBe(true);
    expect(deriveAtRiskFromMomentum({ state: 'on_track', days: 4, cushionRemaining: null, slippingMarkId: null })).toBe(false);
    expect(deriveAtRiskFromMomentum({ state: 'resting', days: 4, cushionRemaining: null, slippingMarkId: null })).toBe(false);
    expect(deriveAtRiskFromMomentum({ state: 'broken', days: 0, cushionRemaining: null, slippingMarkId: null })).toBe(false);
    expect(deriveAtRiskFromMomentum(null)).toBe(false);
  });
});
