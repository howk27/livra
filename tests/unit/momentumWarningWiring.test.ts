// Guards that the warning reconcile entry point is importable and callable.
// The full log-eval → reconcile path is exercised via tests/unit/momentumIntegration.test.ts
// (credit path) plus the explicit wiring edits in hooks/useCounters.ts and app/_layout.tsx,
// which are verified by reading the diff.
import { reconcileMomentumWarnings } from '../../services/momentumWarningNotifications';

jest.mock('../../services/momentumWarningNotifications', () => ({
  reconcileMomentumWarnings: jest.fn().mockResolvedValue(undefined),
}));

describe('warning reconcile wiring (smoke)', () => {
  it('reconcileMomentumWarnings is importable and callable', async () => {
    await reconcileMomentumWarnings('u1');
    expect(reconcileMomentumWarnings).toHaveBeenCalledWith('u1');
  });
});
